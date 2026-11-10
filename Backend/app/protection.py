"""Envelope encryption of uploaded documents.

Async port of protect.ipynb: AES-256-GCM document encryption with a fresh
per-document DEK, the DEK wrapped with an RSA public key from AWS KMS
(OAEP / MGF1-SHA256), a canonical-JSON manifest signed through KMS
(RSASSA_PSS_SHA_256 over the SHA-256 digest) and upload of the three package
objects (ciphertext.bin, signature.bin, manifest.json) to S3 with SSE-KMS.

The function bodies are kept as close to the notebook as possible; only the
I/O calls were converted to their async equivalents (aiofiles, aioboto3).
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import mimetypes
import re
import secrets    ## Used to generate cryptographically secure random AES keys.
from datetime import datetime, timezone
from pathlib import Path

import aiofiles
import aiofiles.os
from boto3.s3.transfer import TransferConfig

from cryptography.hazmat.primitives import hashes   ## Used for SHA-256 hashing and RSA signature verification.
from cryptography.hazmat.primitives.asymmetric import padding    ## Used for RSA signature verification.
from cryptography.hazmat.primitives.serialization import (
    load_der_public_key,   ## Converts the public key returned by KMS in DER ENCODED FORMAT into a Python RSA public-key object.
)

from cryptography.hazmat.primitives.ciphers import (    ## Used for AES-256-GCM.
    Cipher,
    algorithms,
    modes,
)

from . import aws
from .config import settings

S3_BUCKET = settings.medical_rag_bucket

KMS_ENCRYPTION_KEY_ID = settings.kms_encryption_key_id

KMS_SIGNING_KEY_ID = settings.kms_signing_key_id

S3_SSE_KMS_KEY_ID = settings.s3_sse_kms_key_id

S3_PREFIX = settings.s3_prefix

## Server-side equivalent of the notebook's temporary workspace: the encrypted
## copy of a document is written here and deleted once it is uploaded to S3.
ENCRYPTED_DIR = settings.encrypted_dir


def generate_document_id() -> str:
    return secrets.token_hex(16)


USER_ID_PATTERN = re.compile(
    r"^[A-Za-z0-9_-]{1,128}$"
)

DOCUMENT_ID_PATTERN = re.compile(
    r"^[a-f0-9]{32}$"
)


def validate_identifiers(
    user_id: str,
    document_id: str,
) -> None:

    if not USER_ID_PATTERN.fullmatch(user_id):
        raise ValueError("Invalid user_id.")

    if not DOCUMENT_ID_PATTERN.fullmatch(document_id):
        raise ValueError("Invalid document_id.")


async def get_rsa_public_key(kms_client, kms_key_id: str):   ## Retrieves the RSA public key from AWS KMS.
    response = await kms_client.get_public_key(
        KeyId=kms_key_id
    )

    public_key = load_der_public_key(
        response["PublicKey"]
    )

    return public_key


def generate_aes_key() -> bytes:   ## Generates a random 256-bit AES key using the secrets module for cryptographic security.
    return secrets.token_bytes(32)


async def encrypt_file(   ## Encrypts a file using AES-256-GCM and writes the encrypted data to a new file.
    input_path: str,
    output_path: str,
    aes_key: bytes,
):
    if len(aes_key) != 32:
        raise ValueError(
            "AES key must be exactly 32 bytes."
        )

    nonce = secrets.token_bytes(12)  ## GCM uses a 12-byte nonce.

    encryptor = Cipher(
        algorithms.AES(aes_key),    ## The actual mathematical algorithm for encyption.  Block cipher
        modes.GCM(nonce),     ## This is the mode of operation for AES which tells how to handle many blocks as its a block cipher. It requires a nonce (number used once) to ensure that the same plaintext encrypts to different ciphertexts each time.
    ).encryptor()

    ciphertext_hash = hashlib.sha256()

    async with (
        aiofiles.open(input_path, "rb") as source,
        aiofiles.open(output_path, "wb") as target,
    ):
        while True:
            chunk = await source.read(1024 * 1024)   ## Read in 1 MB chunks for efficiency.

            if not chunk:
                break

            encrypted_chunk = encryptor.update(
                chunk
            )

            await target.write(encrypted_chunk)

            ciphertext_hash.update(
                encrypted_chunk
            )

        encryptor.finalize()  ## Finalize the encryption process to ensure all data is processed.

        tag = encryptor.tag   ## The GCM tag allows us to detect tampering.

    return {
        "nonce": nonce,
        "tag": tag,
        "ciphertext_sha256": ciphertext_hash.hexdigest(),
    }


def encrypt_aes_key_with_rsa(
    aes_key: bytes,
    public_key,  ## Public key for the encryption decryption KMS
) -> bytes:
    encrypted_aes_key = public_key.encrypt(    ## .encrypt() method encrypts the AES key using RSA public key with OAEP padding and SHA-256 hashing.
        aes_key,
        padding.OAEP(
            mgf=padding.MGF1(
                algorithm=hashes.SHA256()
            ),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )

    return encrypted_aes_key


def canonical_json(data: dict) -> bytes:   ## Converts a Python dictionary into a canonical JSON byte string for consistent hashing and signing. It will sort the keys and use compact separators to ensure that the JSON representation is consistent across all platforms and languages.
    return json.dumps(                       ## It will also help in generating a consistent hash for the manifest, which is crucial for signature verification.
        data,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def build_manifest(
    *,
    document_id: str,
    user_id: str,
    original_filename: str,
    mime_type: str,
    original_size: int,
    encrypted_aes_key: bytes,
    nonce: bytes,
    tag: bytes,
    ciphertext_sha256: str,
):
    return {
        "format_version": 1,

        "document_id": document_id,

        "user_id": user_id,

        "document": {
            "filename": original_filename,
            "mime_type": mime_type,
            "original_size": original_size,
        },

        "encryption": {
            "document_algorithm": "AES-256-GCM",

            "key_algorithm": "RSA-OAEP-SHA256",

            "encryption_key_id": KMS_ENCRYPTION_KEY_ID,

            "encrypted_aes_key": (
                base64.b64encode(    ## encrypted_aes_key is bytes form. base64.b64encode() converts it to base64 bytes, and .decode("ascii") converts it to a string for JSON serialization.
                    encrypted_aes_key
                ).decode("ascii")
            ),

            "nonce": (
                base64.b64encode(
                    nonce
                ).decode("ascii")
            ),

            "tag": (
                base64.b64encode(
                    tag
                ).decode("ascii")
            ),
        },

        "ciphertext": {
            "sha256": ciphertext_sha256,
        },

        "created_at": datetime.now(
            timezone.utc
        ).isoformat(),
    }


async def sign_manifest(
    kms_client,
    signing_key_id: str,
    manifest: dict,
):
    manifest_bytes = canonical_json(manifest)

    digest = hashlib.sha256(
        manifest_bytes
    ).digest()

    response = await kms_client.sign(
        KeyId=signing_key_id,

        Message=digest,

        MessageType="DIGEST",  ## Indicates that the message is already hashed, so KMS will not hash it again.

        SigningAlgorithm="RSASSA_PSS_SHA_256",
    )

    return response["Signature"]


async def prepare_document(
    *,
    input_path: str,
    user_id: str,
    document_id: str,
    original_filename: str | None = None,
):
    input_file = Path(input_path)

    if not input_file.is_file():
        raise FileNotFoundError(
            f"File not found: {input_path}"
        )

    validate_identifiers(
        user_id,
        document_id,
    )

    ## The document is stored on the server under its document id; the true
    ## original filename (used for the manifest and MIME detection) is passed
    ## separately and defaults to the on-disk name as in the notebook.
    display_filename = original_filename or input_file.name

    mime_type, _ = mimetypes.guess_type(
        display_filename
    )

    if mime_type is None:
        mime_type = (
            "application/octet-stream"
        )

    encrypted_path = (
        ENCRYPTED_DIR /
        f"{document_id}.ciphertext"
    )

    # --------------------------------------------
    # 1. Get public encryption key from KMS
    # --------------------------------------------

    encryption_public_key = await get_rsa_public_key(
        aws.kms,
        KMS_ENCRYPTION_KEY_ID,
    )

    # --------------------------------------------
    # 2. Generate unique AES key
    # --------------------------------------------

    aes_key = generate_aes_key()

    try:
        # ----------------------------------------
        # 3. Encrypt actual document with AES
        # ----------------------------------------

        encryption_result = await encrypt_file(
            input_path=str(input_file),

            output_path=str(
                encrypted_path
            ),

            aes_key=aes_key,
        )

        # ----------------------------------------
        # 4. Protect AES key with RSA public key
        # ----------------------------------------

        encrypted_aes_key = (
            encrypt_aes_key_with_rsa(
                aes_key=aes_key,
                public_key=encryption_public_key,
            )
        )

        # ----------------------------------------
        # 5. Build manifest
        # ----------------------------------------

        stat_result = await aiofiles.os.stat(input_file)

        manifest = build_manifest(
            document_id=document_id,

            user_id=user_id,

            original_filename=display_filename,

            mime_type=mime_type,

            original_size=stat_result.st_size,

            encrypted_aes_key=encrypted_aes_key,

            nonce=encryption_result["nonce"],

            tag=encryption_result["tag"],

            ciphertext_sha256=(
                encryption_result[
                    "ciphertext_sha256"
                ]
            ),
        )

        # ----------------------------------------
        # 6. Sign manifest with KMS private key
        # ----------------------------------------

        signature = await sign_manifest(
            kms_client=aws.kms,

            signing_key_id=(
                KMS_SIGNING_KEY_ID
            ),

            manifest=manifest,
        )

        return {
            "encrypted_path": encrypted_path,

            "manifest": manifest,

            "signature": signature,
        }

    finally:
        # ----------------------------------------
        # 7. Remove AES key reference
        # ----------------------------------------

        del aes_key


async def upload_document(
    *,
    prepared: dict,
    bucket: str,
    user_id: str,
    document_id: str,
):
    encrypted_path = (
        prepared["encrypted_path"]
    )

    manifest = prepared["manifest"]

    signature = prepared["signature"]

    prefix = (
        f"{S3_PREFIX}/"
        f"{user_id}/"
        f"{document_id}"
    )

    ciphertext_key = (
        f"{prefix}/ciphertext.bin"
    )

    signature_key = (
        f"{prefix}/signature.bin"
    )

    manifest_key = (
        f"{prefix}/manifest.json"
    )

    transfer_config = TransferConfig(
        multipart_threshold=8 * 1024 * 1024,
        multipart_chunksize=8 * 1024 * 1024,
        max_concurrency=4,
        use_threads=True,
    )

    bucket_resource = await aws.s3.Bucket(bucket)

    uploaded_keys = []

    async def upload_ciphertext():
        await bucket_resource.upload_file(
            str(encrypted_path),
            ciphertext_key,
            ExtraArgs={
                "ContentType": "application/octet-stream",
                "ServerSideEncryption": "aws:kms",
                "SSEKMSKeyId": S3_SSE_KMS_KEY_ID,
                "BucketKeyEnabled": True,
            },
            Config=transfer_config,
        )
        return ciphertext_key

    async def upload_signature():
        await bucket_resource.put_object(
            Key=signature_key,
            Body=signature,
            ContentType="application/octet-stream",
            ServerSideEncryption="aws:kms",
            SSEKMSKeyId=S3_SSE_KMS_KEY_ID,
            BucketKeyEnabled=True,
        )
        return signature_key

    try:
        # Upload the ciphertext and the signature concurrently; the manifest
        # is uploaded last only after both succeeded (as in the notebook).
        results = await asyncio.gather(
            upload_ciphertext(),
            upload_signature(),
            return_exceptions=True,
        )

        upload_errors = [
            result for result in results if isinstance(result, BaseException)
        ]

        if upload_errors:
            raise upload_errors[0]

        uploaded_keys.extend(
            result for result in results if not isinstance(result, BaseException)
        )

        manifest_bytes = canonical_json(manifest)

        await bucket_resource.put_object(
            Key=manifest_key,
            Body=manifest_bytes,
            ContentType="application/json",
            ServerSideEncryption="aws:kms",
            SSEKMSKeyId=S3_SSE_KMS_KEY_ID,
            BucketKeyEnabled=True,
        )

        uploaded_keys.append(manifest_key)

        return {
            "bucket": bucket,
            "document_id": document_id,
            "ciphertext_key": ciphertext_key,
            "manifest_key": manifest_key,
            "signature_key": signature_key,
        }

    except Exception:
        for key in uploaded_keys:
            try:
                await bucket_resource.delete_object(
                    Key=key,
                )
            except Exception:
                pass

        raise
