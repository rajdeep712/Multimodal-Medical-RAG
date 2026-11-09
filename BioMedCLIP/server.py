import io
import base64
import binascii
import torch
import open_clip
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from typing import List

app = FastAPI(
    title="BiomedCLIP Local Embedding Server",
    description="LM Studio-style local API server for BiomedCLIP 512-dim vector embeddings",
)

# Enable CORS for local app integrations
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Device Selection & Model Initialization
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Loading BiomedCLIP on device: {device}...")

# Load the official Microsoft BiomedCLIP architecture and weights
model, _, preprocess = open_clip.create_model_and_transforms(
    model_name="hf-hub:microsoft/BiomedCLIP-PubMedBERT_256-vit_base_patch16_224"
)
tokenizer = open_clip.get_tokenizer(
    "hf-hub:microsoft/BiomedCLIP-PubMedBERT_256-vit_base_patch16_224"
)

model.to(device)
model.eval()
print("Model loaded and ready!")


# 2. Define Request Schemas
class TextQuery(BaseModel):
    text: str


class Base64BatchQuery(BaseModel):
    images: List[str]


# 3. Text Embedding Endpoint
@app.post("/v1/embeddings/text")
async def embed_text(query: TextQuery):
    try:
        with torch.no_grad(), torch.cuda.amp.autocast(enabled=(device.type == "cuda")):
            # Tokenize and encode the user text query
            text_tokens = tokenizer([query.text]).to(device)
            text_features = model.encode_text(text_tokens)
            # Normalize to unit length for direct cosine similarity matching
            text_features /= text_features.norm(dim=-1, keepdim=True)

            embedding = text_features[0].cpu().tolist()

        return {"embedding": embedding, "dimensions": len(embedding)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 4. Image Embedding Endpoint
@app.post("/v1/embeddings/image")
async def embed_image(file: UploadFile = File(...)):
    try:
        # Read the uploaded medical image
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        with torch.no_grad(), torch.cuda.amp.autocast(enabled=(device.type == "cuda")):
            # Preprocess and encode the image
            processed_image = preprocess(image).unsqueeze(0).to(device)
            image_features = model.encode_image(processed_image)
            # Normalize to unit length
            image_features /= image_features.norm(dim=-1, keepdim=True)

            embedding = image_features[0].cpu().tolist()

        return {"embedding": embedding, "dimensions": len(embedding)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Health Check Endpoint
@app.get("/health")
def health_check():
    return {"status": "healthy", "model": "BiomedCLIP", "device": str(device)}


# 5. Batch Base64 Image Embedding Endpoint
@app.post("/v1/embeddings/images/batch")
async def embed_images_batch(query: Base64BatchQuery):
    try:
        if not query.images:
            raise HTTPException(status_code=400, detail="No images provided")

        processed_images = []

        # Decode and preprocess all base64 images
        for b64_str in query.images:
            # Strip data URI prefix if present (e.g., "data:image/jpeg;base64,")
            if "," in b64_str:
                b64_str = b64_str.split(",")[1]

            try:
                image_bytes = base64.b64decode(b64_str, validate=True)
            except (binascii.Error, ValueError) as e:
                raise HTTPException(status_code=400, detail="Invalid base64 image data") from e
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            processed_images.append(preprocess(image))

        with torch.no_grad(), torch.cuda.amp.autocast(enabled=(device.type == "cuda")):
            # Stack into a single batch tensor: shape [Batch_Size, C, H, W]
            batch_tensor = torch.stack(processed_images).to(device)

            image_features = model.encode_image(batch_tensor)

            # Normalize to unit length
            image_features /= image_features.norm(dim=-1, keepdim=True)

            # Convert the batch of embeddings to a Python list of lists
            embeddings = image_features.cpu().tolist()

        return {
            "embeddings": embeddings,
            "dimensions": len(embeddings[0]) if embeddings else 0,
            "batch_size": len(embeddings),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
