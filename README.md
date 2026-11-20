<h1 align="center">MediLens AI — Secure Multimodal Search and Chat for Medical Documents</h1>

<p align="center">
  <strong>Ask questions about PDFs and images, get answers grounded in your documents, and follow citations to the source page.</strong>
</p>

<p align="center">
  <a href="Backend"><img src="https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&amp;logoColor=white&amp;style=for-the-badge" alt="Backend: FastAPI" /></a>
  <a href="Frontend"><img src="https://img.shields.io/badge/frontend-React-087EA4?logo=react&amp;logoColor=white&amp;style=for-the-badge" alt="Frontend: React" /></a>
  <a href="Backend/app/celery_app.py"><img src="https://img.shields.io/badge/worker-Celery-37814A?logo=celery&amp;logoColor=white&amp;style=for-the-badge" alt="Worker: Celery" /></a>
  <a href="Backend/app/celery_app.py"><img src="https://img.shields.io/badge/queue-Redis-DC382D?logo=redis&amp;logoColor=white&amp;style=for-the-badge" alt="Queue: Redis" /></a>
</p>

<p align="center">
  <a href="Backend/app/database.py"><img src="https://img.shields.io/badge/database-PostgreSQL-4169E1?logo=postgresql&amp;logoColor=white&amp;style=for-the-badge" alt="Database: PostgreSQL" /></a>
  <a href="Backend/app/auth0.py"><img src="https://img.shields.io/badge/auth-Auth0-EB5424?logo=auth0&amp;logoColor=white&amp;style=for-the-badge" alt="Authentication: Auth0" /></a>
  <a href="Backend/app/ingestion/qdrant_store.py"><img src="https://img.shields.io/badge/vector%20search-Qdrant%20Cloud-B52658?style=for-the-badge" alt="Vector search: Qdrant Cloud" /></a>
  <a href="Backend/app/aws.py"><img src="https://img.shields.io/badge/object%20storage-AWS%20S3-447A14?style=for-the-badge" alt="Object storage: AWS S3" /></a>
</p>

<p align="center">
  <a href="Backend/app/protection.py"><img src="https://img.shields.io/badge/keys%20%26%20signing-AWS%20KMS-9A5200?style=for-the-badge" alt="Key management: AWS KMS" /></a>
  <a href="Backend/app/ingestion/content.py"><img src="https://img.shields.io/badge/document%20parsing-Unstructured-6554C0?style=for-the-badge" alt="Document parsing: Unstructured" /></a>
  <a href="#1-ingestion"><img src="https://img.shields.io/badge/embeddings-MedEmbed%20%2B%20BioMedCLIP-176B87?style=for-the-badge" alt="Text and image embeddings: MedEmbed and BioMedCLIP" /></a>
  <a href="Backend/app/chat_llm.py"><img src="https://img.shields.io/badge/chat%20providers-Groq%20%2F%20Gemini-5C48B8?style=for-the-badge" alt="Chat providers: Groq and Gemini" /></a>
</p>

---

![Animated MediLens AI overview: a medical document is indexed, its evidence supports a cited answer, and the protected original can be verified and opened.](docs/readme/architecture.gif)

MediLens AI is a multimodal retrieval app for medical documents. Upload PDFs or images, ask a question across your documents, and follow citations back to the relevant pages. Text, tables, and images can all contribute evidence to a streamed answer.

[Ingestion](#1-ingestion) · [Inference](#2-inference) · [Decryption](#3-decryption-and-integrity) · [Local setup](#run-locally)

## Screenshots

| Chat workspace | Document viewer |
| :---: | :---: |
| _Screenshot placeholder: a streamed answer with citations_ | _Screenshot placeholder: a report page with the cited region highlighted_ |

<!-- Replace each placeholder cell with an image once available:
![Chat workspace](docs/readme/chat-workspace.png)
![Document viewer](docs/readme/document-viewer.png)
-->

## 1. Ingestion

FastAPI validates the upload, hashes its bytes for duplicate detection within the account, and stages a local PDF (converting PNG or JPEG when needed). The API uploads the encrypted package before recording the secured document in PostgreSQL and sending its ID to Celery via Redis.

```mermaid
flowchart TD

subgraph group_upload["Upload and protection"]
  node_upload["Upload PDF, PNG, or JPEG"]
  node_stage["Validate size and format<br/>Hash upload with SHA-256 and stage PDF"]
  node_encrypt["Encrypt PDF, wrap AES key, and sign manifest"]
  node_package[("Private S3<br/>Ciphertext, manifest, and signature")]
  node_record[("PostgreSQL<br/>Secured document record")]
end

subgraph group_indexing["Background indexing"]
  node_worker["Redis queue and Celery worker"]
  node_extract["Unstructured<br/>Extract text, tables, and images"]
  node_text["Redact text and normalized tables<br/>MedEmbed: 1024 dimensions"]
  node_images["Analyze images and discard irrelevant results<br/>Embed summaries with MedEmbed and images with BioMedCLIP"]
  node_assets[("Private S3<br/>Retained images")]
  node_index[("Qdrant<br/>Vectors and citation metadata")]
end

node_upload --> node_stage
node_stage --> node_encrypt
node_encrypt --> node_package
node_package --> node_record
node_record --> node_worker
node_worker --> node_extract
node_extract -->|"text and tables"| node_text
node_extract -->|"images"| node_images
node_text --> node_index
node_images --> node_assets
node_assets -->|"upload before publishing image points with bucket and key"| node_index

classDef toneBlue fill:#dbeafe,stroke:#2563eb,color:#172554
classDef toneMint fill:#dcfce7,stroke:#16a34a,color:#14532d
class node_package,node_record,node_assets toneBlue
class node_index toneMint
```

- **Text and tables:** MedEmbed Large v0.1 produces **1,024-dimensional** vectors. Table rows are normalized for embedding; HTML is kept for retrieval.
- **Images:** The worker drops irrelevant results, handles single-page image-only PDFs when extraction returns no chunks, and uses full-page context for handwriting when available. Retained images get **512-dimensional** BioMedCLIP vectors and their summaries get MedEmbed vectors.
- **Source metadata:** Qdrant stores document and page references, content type, citation coordinates when available, and `image_s3_bucket` / `image_s3_key` for images. These fields hold a durable storage reference.

## 2. Inference

The query is embedded twice: MedEmbed searches the text space, and the BioMedCLIP text encoder searches the image space. Qdrant filters by owner and applicable document or date constraints, then merges the two rankings with reciprocal rank fusion.

```mermaid
flowchart TD

subgraph group_search["Evidence retrieval"]
  node_query["Question and document filters"]
  node_embed["Encode query with MedEmbed and BioMedCLIP<br/>1024 and 512 dimensions"]
  node_search[("Qdrant<br/>Filter and fuse text and image rankings")]
  node_select["Select up to 5 chunks and at most 2 images by default"]
end

subgraph group_answer["Answer generation"]
  node_sign["Validate image scope and sign S3 GET URLs<br/>5-minute expiry by default"]
  node_history[("PostgreSQL chat history")]
  node_context["Assemble prompt, history, and selected evidence"]
  node_model["Multimodal LLM<br/>Fetch selected images directly from S3"]
  node_answer["Stream the answer and citations"]
end

node_query --> node_embed
node_embed --> node_search
node_search --> node_select
node_select -->|"text and tables"| node_context
node_select -->|"image bucket and key"| node_sign
node_sign -->|"presigned image URLs"| node_context
node_history --> node_context
node_context --> node_model
node_model --> node_answer

classDef toneBlue fill:#dbeafe,stroke:#2563eb,color:#172554
classDef toneMint fill:#dcfce7,stroke:#16a34a,color:#14532d
class node_search,node_history toneBlue
class node_answer toneMint
```

Image signing happens after selection. The API sends temporary URLs to the model without reading image bytes from PostgreSQL, downloading the images itself, or converting them to Base64. The URLs are generated for the request and are not stored in Qdrant.

## 3. Decryption and integrity

**Confidentiality.** Each PDF is encrypted with a fresh **AES-256-GCM** key. The backend wraps that key with the public half of an AWS KMS RSA key using **RSA-OAEP with SHA-256**. Unwrapping requires permission to use the private key in KMS. S3 also applies **SSE-KMS** to the package objects at rest.

**Integrity.** The manifest binds the package to its user and document IDs. It records the wrapped key, nonce, GCM tag, PDF metadata, and SHA-256 hash of the ciphertext. The API serializes the manifest as canonical JSON, hashes it, and asks a separate KMS key to sign the digest using **RSA-PSS with SHA-256**. The signature protects the manifest, the signed hash binds it to the encrypted file, and the GCM tag authenticates the bytes during decryption.

| S3 object | Contents |
| --- | --- |
| `ciphertext.bin` | The encrypted PDF bytes |
| `manifest.json` | Document identity, encryption parameters, and ciphertext hash |
| `signature.bin` | The detached signature over the manifest digest |

```mermaid
flowchart TD

subgraph group_verify["Package verification"]
  node_request["Authorized document request"]
  node_fetch[("Download ciphertext, manifest, and signature from S3")]
  node_verify{"Owner, manifest signature, and ciphertext hash valid?"}
end

subgraph group_decrypt["Decryption and delivery"]
  node_unwrap["Unwrap the AES key with AWS KMS"]
  node_authenticate{"AES-GCM tag and PDF header valid?"}
  node_serve["Stream the verified PDF and clean up temporary files"]
end

node_reject["Reject the package"]

node_request --> node_fetch
node_fetch --> node_verify
node_verify -->|"yes"| node_unwrap
node_verify -->|"no"| node_reject
node_unwrap --> node_authenticate
node_authenticate -->|"yes"| node_serve
node_authenticate -->|"no"| node_reject

classDef toneAmber fill:#fef3c7,stroke:#d97706,color:#78350f
classDef toneMint fill:#dcfce7,stroke:#16a34a,color:#14532d
classDef toneRose fill:#ffe4e6,stroke:#e11d48,color:#881337
class node_verify,node_authenticate toneAmber
class node_serve toneMint
class node_reject toneRose
```

This protects the stored source PDF. The server decrypts it for authorized viewing and may use a local plaintext copy for ingestion. Retrieved evidence can also reach the configured model providers. The current PII client can pass through unredacted text if the service is unreachable, so use synthetic or de-identified documents for local trials.

## Run locally

The example uses a Bash shell on Linux or WSL2. Run the commands from the repository root unless a block changes directories, and run the API and Celery in the same environment so they share the local upload folder.

### 1. Start PostgreSQL and Redis

Install Git, Python 3.11 (with `venv`), Node.js 22.12+, Docker, and the PDF/OCR tools Poppler and Tesseract. On Ubuntu or WSL2:

```bash
git clone https://github.com/rajdeep712/Multimodal-Medical-RAG.git
cd Multimodal-Medical-RAG
sudo apt-get update
sudo apt-get install -y poppler-utils tesseract-ocr
docker run -d --name medilens-postgres -p 127.0.0.1:5432:5432 \
  -e POSTGRES_DB=medilens -e POSTGRES_PASSWORD=local-dev-only postgres:16
docker run -d --name medilens-redis -p 127.0.0.1:6379:6379 redis:7

python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r Backend/requirements.txt -r BioMedCLIP/requirements.txt
python -m pip install sentencepiece
```

### 2. Configure Qdrant Cloud, Auth0, and AWS

| Service | Set up |
| --- | --- |
| **[Qdrant Cloud](https://qdrant.tech/documentation/cloud/getting-started/)** | Create a cluster and a database API key with write and collection creation permissions. Copy the HTTPS endpoint and key. The worker creates `medical_documents` if it is missing, with 1,024D `text_vector` and 512D `image_vector` fields. |
| **[Auth0](https://auth0.com/docs/get-started/applications/application-grant-types)** | Create a Regular Web Application and enable a database connection for it. Enable the **Password** (password realm) and **Refresh Token** grants. Register an API with an identifier for the audience and enable **Allow Offline Access**. Copy the tenant domain (without `https://`), client ID, client secret, API identifier, and database connection name. This app sends login requests through the backend and uses session cookies. |
| **[AWS S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html)** | Create private storage for document packages and retained images; you can use one bucket with separate prefixes. Keep public access blocked. Use a symmetric AWS KMS key in the bucket region for SSE-KMS. For `MEDICAL_RAG_BUCKET`, use the bucket name; for `IMAGE_S3_URL`, use `s3://bucket/prefix`. |
| **[AWS KMS](https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html)** | Create separate RSA keys: one `ENCRYPT_DECRYPT` key for RSA-OAEP/SHA-256 and one `SIGN_VERIFY` key for RSA-PSS/SHA-256. Use their key ARNs alongside the symmetric SSE-KMS key ARN. |

Configure an AWS CLI profile or another standard AWS credential source available to **both** the API and worker. Check with `aws sts get-caller-identity` in the shell that will run them. Give that identity scoped S3 read, write, delete, and bucket-list access; `kms:GetPublicKey` on both RSA keys; `kms:Decrypt` on the wrapping key; `kms:Sign` on the signing key; and `kms:GenerateDataKey` / `kms:Decrypt` on the SSE-KMS key. Include the corresponding permissions in the key policies.

### 3. Start the local model services

Run these services before starting the worker:

| Service | Launch |
| --- | --- |
| **MedEmbed** | Load **MedEmbed Large v0.1** in LM Studio and start its OpenAI-compatible local server on port `1234`. Use the model ID shown by the server; the model must return 1,024-dimensional embeddings. |
| **BioMedCLIP** | Run `python -m uvicorn server:app --app-dir BioMedCLIP --host 127.0.0.1 --port 8001`. The first launch downloads the model weights. |
| **PII detection** | Use the checked-in [PII serving notebook](DOCUMENT%20FILTERING%20AND%20PII%20Detection/medical-pii-roberta-server.ipynb) as a local FastAPI service. You need the fine-tuned token-classification checkpoint plus its tokenizer files; the notebook contains the server code, not the weights. See the [training notebook](DOCUMENT%20FILTERING%20AND%20PII%20Detection/Medical_PII_Detect_FineTuning.ipynb) if you need to produce the checkpoint. |

To start the PII API, extract the notebook's FastAPI cell into the disposable virtual environment and point it at your local model directory:

```bash
python - <<'PY'
import json
from pathlib import Path

notebook = Path("DOCUMENT FILTERING AND PII Detection/medical-pii-roberta-server.ipynb")
for cell in json.loads(notebook.read_text(encoding="utf-8"))["cells"]:
    source = "".join(cell["source"])
    if source.startswith("%%writefile "):
        Path(".venv/pii_server.py").write_text(source.split("\n", 1)[1], encoding="utf-8")
        break
else:
    raise SystemExit("PII server cell not found")
PY
MODEL_PATH=/absolute/path/to/pii-checkpoint \
  python -m uvicorn pii_server:app --app-dir .venv --host 127.0.0.1 --port 8002
```

The local API exposes `/health` and `/detect-pii/batch`. No public tunnel is needed.

If LM Studio runs on the Windows host and the backend runs in WSL2, set `TEXT_EMBEDDING_BASE_URL` to a Windows host address reachable from WSL, or use mirrored networking for localhost access.

### 4. Set environment variables and launch

Create `Backend/.env` with your own values. The example uses [Groq's vision API](https://console.groq.com/docs/vision) for chat and image analysis. You can configure the providers separately. For Gemini chat, set `LLM_PROVIDER=GOOGLE`, `GOOGLE_API_KEY`, and `GOOGLE_CHAT_MODEL`; verify that your chosen endpoint accepts remote HTTPS `image_url` inputs, since the chat path sends presigned URLs.

```dotenv
POSTGRES_CONNECTION_STRING=postgresql://postgres:local-dev-only@127.0.0.1:5432/medilens
CELERY_BROKER_URL=redis://127.0.0.1:6379/0
CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/1

QDRANT_URL=https://your-cluster-endpoint
QDRANT_API_KEY=replace-me
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=replace-me
AUTH0_CLIENT_SECRET=replace-me
AUTH0_AUDIENCE=https://your-api-identifier
AUTH0_CONNECTION=Username-Password-Authentication

AWS_REGION=us-east-1
MEDICAL_RAG_BUCKET=your-private-bucket
KMS_ENCRYPTION_KEY_ID=replace-with-rsa-encryption-key-arn
KMS_SIGNING_KEY_ID=replace-with-rsa-signing-key-arn
S3_SSE_KMS_KEY_ID=replace-with-symmetric-key-arn
IMAGE_S3_URL=s3://your-private-bucket/medical-images
IMAGE_PRESIGNED_URL_TTL_SECONDS=300
IMAGE_S3_UPLOAD_CONCURRENCY=5

TEXT_EMBEDDING_BASE_URL=http://127.0.0.1:1234/v1
TEXT_EMBEDDING_MODEL=text-embedding-medembed-large-v0.1
PII_API_URL=http://127.0.0.1:8002
LLM_PROVIDER=GROQ
GROQ_API_KEY=replace-me
CHAT_LLM_MODEL=qwen/qwen3.8-27b
IMAGE_ANALYSIS_BASE_URL=https://api.groq.com/openai/v1
IMAGE_ANALYSIS_MODEL=qwen/qwen3.8-27b
IMAGE_ANALYSIS_API_KEY=replace-with-your-groq-api-key
```

Keep credentials in your shell or ignored `.env` files. In separate terminals, start:

```bash
# API — activate the Python environment from the repo root first
source .venv/bin/activate
cd Backend
python init_db.py
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
# Worker — after PostgreSQL is initialized
source .venv/bin/activate
cd Backend
python -m celery -A app.celery_app:celery_app worker --loglevel=INFO --pool=threads --concurrency=3
```

```bash
# Frontend — proxy API calls through Vite to preserve same-origin cookies
cd Frontend
npm ci
VITE_API_URL=/api npm run dev
```

Open **http://localhost:3000**, sign in, and upload a sample PDF or image. Wait until indexing finishes, ask a question about the file, and open a citation to verify that it takes you to the source page.
