from __future__ import annotations

import asyncio
import base64
import hashlib
import json
from collections.abc import Awaitable, Callable
from pathlib import Path

import aiofiles
from boto3.s3.transfer import TransferConfig
from cryptography.exceptions import InvalidSignature, InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, utils
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.serialization import load_der_public_key

from . import aws
from .config import settings
from .protection import canonical_json


class SecurityError(Exception):
    pass


class DocumentRequestCancelled(Exception):
    pass


DisconnectCheck = Callable[[], Awaitable[bool]]


async def _raise_if_cancelled(is_disconnected: DisconnectCheck | None) -> None:
    if is_disconnected is not None and await is_disconnected():
        raise DocumentRequestCancelled("Client disconnected")


async def download_encrypted_package(
    *,
    bucket: str,
    prefix: str,
    output_directory: Path,
    is_disconnected: DisconnectCheck | None = None,
) -> dict[str, Path]:
    output_directory.mkdir(parents=True, exist_ok=True)

    package_files = {
        "ciphertext_path": "ciphertext.bin",
        "manifest_path": "manifest.json",
        "signature_path": "signature.bin",
    }
    paths = {
        key: output_directory / filename
        for key, filename in package_files.items()
    }

    transfer_config = TransferConfig(
        multipart_threshold=8 * 1024 * 1024,
        multipart_chunksize=8 * 1024 * 1024,
        max_concurrency=4,
        use_threads=True,
    )

    bucket_resource = await aws.s3.Bucket(bucket)

    async def download_one(key: str, destination: Path) -> None:
        await bucket_resource.download_file(
            key,
            str(destination),
            Config=transfer_config,
        )

    await _raise_if_cancelled(is_disconnected)
    await asyncio.gather(
        *(
            download_one(f"{prefix}/{filename}", paths[key])
            for key, filename in package_files.items()
        )
    )
    await _raise_if_cancelled(is_disconnected)

    return paths


async def load_manifest(manifest_path: Path) -> dict:
    async with aiofiles.open(manifest_path, "rb") as source:
        payload = await source.read()
    return json.loads(payload)


async def verify_manifest_signature(
    *,
    signing_key_id: str,
    manifest: dict,
    signature: bytes,
    is_disconnected: DisconnectCheck | None = None,
) -> bool:
    await _raise_if_cancelled(is_disconnected)
    response = await aws.kms.get_public_key(KeyId=signing_key_id)
    public_key = load_der_public_key(response["PublicKey"])

    manifest_bytes = canonical_json(manifest)
    digest = hashlib.sha256(manifest_bytes).digest()

    try:
        public_key.verify(
            signature,
            digest,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=hashes.SHA256().digest_size,
            ),
            utils.Prehashed(hashes.SHA256()),
        )
        return True
    except InvalidSignature:
        return False


async def verify_ciphertext_hash(
    *,
    ciphertext_path: Path,
    expected_hash: str,
    is_disconnected: DisconnectCheck | None = None,
) -> bool:
    sha256 = hashlib.sha256()

    async with aiofiles.open(ciphertext_path, "rb") as source:
        while True:
            await _raise_if_cancelled(is_disconnected)
            chunk = await source.read(1024 * 1024)
            if not chunk:
                break
            sha256.update(chunk)

    return sha256.hexdigest() == expected_hash


def extract_crypto_values(manifest: dict) -> dict:
    encryption = manifest["encryption"]
    return {
        "encrypted_aes_key": base64.b64decode(encryption["encrypted_aes_key"]),
        "nonce": base64.b64decode(encryption["nonce"]),
        "tag": base64.b64decode(encryption["tag"]),
        "expected_hash": manifest["ciphertext"]["sha256"],
    }


async def decrypt_aes_key(
    *,
    kms_key_id: str,
    encrypted_aes_key: bytes,
    is_disconnected: DisconnectCheck | None = None,
) -> bytes:
    await _raise_if_cancelled(is_disconnected)
    response = await aws.kms.decrypt(
        KeyId=kms_key_id,
        CiphertextBlob=encrypted_aes_key,
        EncryptionAlgorithm="RSAES_OAEP_SHA_256",
    )
    await _raise_if_cancelled(is_disconnected)
    return response["Plaintext"]


async def decrypt_file(
    *,
    ciphertext_path: Path,
    output_path: Path,
    aes_key: bytes,
    nonce: bytes,
    tag: bytes,
    is_disconnected: DisconnectCheck | None = None,
) -> None:
    if len(aes_key) != 32:
        raise ValueError("AES key must be exactly 32 bytes")

    decryptor = Cipher(
        algorithms.AES(aes_key),
        modes.GCM(nonce, tag),
    ).decryptor()

    try:
        async with (
            aiofiles.open(ciphertext_path, "rb") as source,
            aiofiles.open(output_path, "wb") as target,
        ):
            while True:
                await _raise_if_cancelled(is_disconnected)
                chunk = await source.read(1024 * 1024)
                if not chunk:
                    break
                await target.write(decryptor.update(chunk))
            decryptor.finalize()
    except InvalidTag as exc:
        raise SecurityError(
            "AES-GCM authentication failed; ciphertext, key, nonce or tag was modified"
        ) from exc


async def verify_and_decrypt_document(
    *,
    package: dict[str, Path],
    output_path: Path,
    user_id: str,
    document_id: str,
    is_disconnected: DisconnectCheck | None = None,
) -> dict:
    await _raise_if_cancelled(is_disconnected)

    manifest = await load_manifest(package["manifest_path"])

    if manifest.get("document_id") != document_id:
        raise SecurityError("Document ID mismatch")
    if manifest.get("user_id") != user_id:
        raise SecurityError("User ID mismatch")

    document = manifest.get("document") or {}
    stored_mime_type = document.get("stored_mime_type")
    if stored_mime_type is not None and stored_mime_type != "application/pdf":
        raise SecurityError("Stored document is not a PDF")
    if stored_mime_type is None and document.get("mime_type") != "application/pdf":
        raise SecurityError("Legacy document is not a PDF")

    async with aiofiles.open(package["signature_path"], "rb") as source:
        signature = await source.read()

    signature_valid = await verify_manifest_signature(
        signing_key_id=settings.kms_signing_key_id,
        manifest=manifest,
        signature=signature,
        is_disconnected=is_disconnected,
    )
    if not signature_valid:
        raise SecurityError("Digital signature verification failed")

    crypto = extract_crypto_values(manifest)

    hash_valid = await verify_ciphertext_hash(
        ciphertext_path=package["ciphertext_path"],
        expected_hash=crypto["expected_hash"],
        is_disconnected=is_disconnected,
    )
    if not hash_valid:
        raise SecurityError("Ciphertext SHA-256 verification failed")

    aes_key = await decrypt_aes_key(
        kms_key_id=settings.kms_encryption_key_id,
        encrypted_aes_key=crypto["encrypted_aes_key"],
        is_disconnected=is_disconnected,
    )

    try:
        await decrypt_file(
            ciphertext_path=package["ciphertext_path"],
            output_path=output_path,
            aes_key=aes_key,
            nonce=crypto["nonce"],
            tag=crypto["tag"],
            is_disconnected=is_disconnected,
        )
    finally:
        del aes_key

    await _raise_if_cancelled(is_disconnected)

    async with aiofiles.open(output_path, "rb") as source:
        if not (await source.read(5)).startswith(b"%PDF"):
            raise SecurityError("Decrypted document is not a PDF")

    return manifest
