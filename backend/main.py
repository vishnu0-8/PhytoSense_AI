# Load backend/.env before importing auth.py or any module that reads secrets.
import os
from pathlib import Path
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env", override=False)

import io
import re
import base64
from datetime import datetime, timedelta, timezone
from collections import Counter

import torch
import numpy as np

from PIL import Image
from torchvision import transforms

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from agent import PlantDiseaseAgent, SUPPORTED_LANGUAGES

from argon2.exceptions import HashingError
from database.history import (
    create_user,
    get_user_by_id,
    update_user_profile,
)
from auth import (
    COOKIE_NAME,
    TOKEN_TTL_SECONDS,
    authenticate_farmer,
    create_access_token,
    decode_access_token,
    public_user,
    register_farmer,
)


import config
from model import build_model

from gradcam.gradcam import GradCAM, overlay_heatmap

from recommendation.recommendation import get_recommendation

from database.history import (
    save_detection,
    get_recent_detections,
    get_conversations,
    get_conversation,
    get_chat_messages,
    delete_conversation,
    clear_history,
    clear_conversation_history,
)


# =====================================================
# FASTAPI APPLICATION
# =====================================================

app = FastAPI(
    title="PlantAI API",
    description="Plant Disease Detection AI Backend",
    version="2.0.0",
)

# Production frontend URL is supplied through CORS_ORIGINS on Render.
# Local origins remain available for development.
_configured_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
]
_allowed_origins = list(dict.fromkeys([
    "https://phytosenseai-frontend.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    *_configured_origins,
]))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)




# =====================================================
# FARMER AUTHENTICATION
# =====================================================

class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str | None = Field(default=None, max_length=254)
    mobile: str | None = Field(default=None, min_length=7, max_length=20)
    password: str = Field(min_length=8, max_length=128)
    village: str | None = Field(default=None, max_length=100)
    district: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value):
        if value:
            value = value.strip().lower()
            if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
                raise ValueError("Enter a valid email address.")
            return value
        return None

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, value):
        if value:
            value = value.strip()
            if not re.fullmatch(r"\+?[0-9]{7,15}", value):
                raise ValueError("Enter a valid mobile number with country code if needed.")
            return value
        return None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Name must contain at least 2 characters.")
        return value


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class ProfileUpdateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    village: str | None = Field(default=None, max_length=100)
    district: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)


def get_current_user(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    payload = decode_access_token(token) if token else None
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required.")
    user = get_user_by_id(int(payload["sub"]))
    if not user or not user.get("is_active"):
        raise HTTPException(status_code=401, detail="Account is unavailable. Please log in again.")
    return user


@app.post("/api/auth/register", status_code=201)
def register(request: RegisterRequest, response: Response):
    if not request.email and not request.mobile:
        raise HTTPException(status_code=422, detail="Provide an email address or mobile number.")
    try:
        user = register_farmer(request)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except Exception as error:
        # Do not expose SQL or password-hashing internals to the client.
        print("Registration error:", error)
        raise HTTPException(status_code=500, detail="Unable to create account.") from error

    token = create_access_token(user["id"])
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=os.getenv("AUTH_COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
        max_age=TOKEN_TTL_SECONDS,
        path="/",
    )
    return {"success": True, "user": user}


@app.post("/api/auth/login")
def login(request: LoginRequest, response: Response):
    user = authenticate_farmer(request.identifier, request.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email/mobile number or password.")
    token = create_access_token(user["id"])
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=os.getenv("AUTH_COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
        max_age=TOKEN_TTL_SECONDS,
        path="/",
    )
    return {"success": True, "user": user}


@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie(
        key=COOKIE_NAME,
        httponly=True,
        secure=os.getenv("AUTH_COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
        path="/",
    )
    return {"success": True, "message": "Logged out."}


@app.get("/api/auth/me")
def current_farmer(user=Depends(get_current_user)):
    return {"authenticated": True, "user": public_user(user)}


@app.patch("/api/auth/profile")
def update_farmer_profile(
    request: ProfileUpdateRequest,
    user=Depends(get_current_user),
):
    updated = update_user_profile(
        user_id=user["id"],
        name=request.name,
        village=request.village,
        district=request.district,
        state=request.state,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Account not found.")
    return {"success": True, "user": public_user(get_user_by_id(user["id"]))}



# =====================================================
# DEVICE
# =====================================================

DEVICE = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)


# =====================================================
# LOAD MODEL
# =====================================================

CHECKPOINT = config.CHECKPOINT_DIR / "best_model.pth"

if not CHECKPOINT.exists():
    raise FileNotFoundError(
        f"Checkpoint not found: {CHECKPOINT}"
    )

checkpoint = torch.load(
    CHECKPOINT,
    map_location=DEVICE,
    weights_only=True,
)

ARCH = checkpoint.get("arch", "resnet18")

NUM_CLASSES = checkpoint.get(
    "num_classes",
    config.NUM_CLASSES,
)

CLASS_NAMES = checkpoint.get("class_names")

if CLASS_NAMES is None:
    CLASS_NAMES = [
        f"class_{i}"
        for i in range(NUM_CLASSES)
    ]

model = build_model(
    arch=ARCH,
    num_classes=NUM_CLASSES,
    pretrained=False,
)

model.load_state_dict(
    checkpoint["model_state_dict"]
)

model.to(DEVICE)
model.eval()


# =====================================================
# GRAD-CAM
# =====================================================

if ARCH in ["resnet18", "resnet34"]:

    target_layer = model.layer4[-1]

else:

    raise ValueError(
        f"Grad-CAM is not configured for {ARCH}"
    )

gradcam = GradCAM(
    model=model,
    target_layer=target_layer,
)


# =====================================================
# IMAGE TRANSFORMATION
# =====================================================

transform = transforms.Compose([

    transforms.Resize(
        (
            config.IMG_SIZE,
            config.IMG_SIZE,
        )
    ),

    transforms.ToTensor(),

    transforms.Normalize(
        config.IMAGENET_MEAN,
        config.IMAGENET_STD,
    ),

])


# =====================================================
# HELPER FUNCTIONS
# =====================================================

def format_label(name):

    return (
        name
        .replace("___", " — ")
        .replace("_", " ")
        .title()
    )


def is_healthy(name):

    return "healthy" in name.lower()


def image_to_base64(image):

    if isinstance(image, np.ndarray):

        image = Image.fromarray(
            image.astype("uint8")
        )

    buffer = io.BytesIO()

    image.save(
        buffer,
        format="PNG",
    )

    encoded = base64.b64encode(
        buffer.getvalue()
    ).decode("utf-8")

    return f"data:image/png;base64,{encoded}"


# =====================================================
# HEALTH CHECK
# =====================================================

@app.get("/api/health")
def health_check():

    return {
        "status": "online",
        "model": ARCH,
        "classes": NUM_CLASSES,
        "device": str(DEVICE),
    }


# =====================================================
# DASHBOARD STATISTICS
# =====================================================

@app.get("/api/dashboard/stats")
def dashboard_stats(user=Depends(get_current_user)):

    records = get_recent_detections(
        limit=100000, user_id=user["id"]
    )

    total = len(records)

    healthy = sum(
        1 for record in records
        if "healthy" in str(record[2]).lower()
    )

    return {
        "total_detections": total,
        "healthy_plants": healthy,
        "diseased_plants": total - healthy,
        "supported_crops": 14,
        "disease_classes": NUM_CLASSES,
        "model_accuracy": 98.99,
    }


# =====================================================
# REAL DISEASE DETECTION
# =====================================================

@app.post("/api/detect")
async def detect_disease(
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):

    allowed_types = [
        "image/jpeg",
        "image/png",
        "image/webp",
    ]

    if file.content_type not in allowed_types:

        raise HTTPException(
            status_code=400,
            detail="Upload JPG, PNG or WEBP image.",
        )

    try:

        image_bytes = await file.read()

        if len(image_bytes) > 10 * 1024 * 1024:

            raise HTTPException(
                status_code=413,
                detail="Image must be smaller than 10 MB.",
            )

        original_image = Image.open(
            io.BytesIO(image_bytes)
        ).convert("RGB")

        tensor = transform(
            original_image
        ).unsqueeze(0).to(DEVICE)


        # ---------------------------------------------
        # PREDICTION
        # ---------------------------------------------

        # Use no_grad for the prediction pass rather than inference_mode.
        # Grad-CAM performs a second forward pass with autograd enabled below.
        with torch.no_grad():

            output = model(tensor)

            probabilities = torch.softmax(
                output,
                dim=1,
            ).squeeze(0)

            top_probs, top_indices = probabilities.topk(5)


        best_index = top_indices[0].item()

        predicted_class = CLASS_NAMES[best_index]

        confidence = top_probs[0].item()


        # ---------------------------------------------
        # TOP 5 PREDICTIONS
        # ---------------------------------------------

        top_predictions = []

        for index, probability in zip(
            top_indices.tolist(),
            top_probs.tolist(),
        ):

            top_predictions.append({

                "disease": CLASS_NAMES[index],

                "label": format_label(
                    CLASS_NAMES[index]
                ),

                "confidence": round(
                    probability * 100,
                    2,
                ),

            })


        # ---------------------------------------------
        # GRAD-CAM
        # ---------------------------------------------

        model.zero_grad(set_to_none=True)

        cam, _ = gradcam.generate(
            tensor,
            target_class=best_index,
        )

        gradcam_result = overlay_heatmap(
            original_image,
            cam,
        )

        gradcam_base64 = image_to_base64(
            gradcam_result
        )


        # ---------------------------------------------
        # RECOMMENDATIONS
        # ---------------------------------------------

        recommendation = get_recommendation(
            predicted_class
        )


        # ---------------------------------------------
        # SAVE DETECTION
        # ---------------------------------------------

        save_detection(
            crop=recommendation["crop"],
            disease=recommendation["disease"],
            confidence=confidence,
            user_id=user["id"],
        )


        # ---------------------------------------------
        # RESPONSE
        # ---------------------------------------------

        return {

            "success": True,

            "prediction": {

                "crop": recommendation["crop"],

                "disease": recommendation["disease"],

                "label": format_label(
                    predicted_class
                ),

                "confidence": round(
                    confidence * 100,
                    2,
                ),

                "healthy": is_healthy(
                    predicted_class
                ),

            },

            "top_predictions": top_predictions,

            "gradcam_image": gradcam_base64,

            "recommendations": recommendation,

        }


    except HTTPException:
        raise

    except Exception as error:

        print("Detection error:", error)

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# =====================================================
# DETECTION HISTORY
# =====================================================

@app.delete("/api/history")
def clear_detection_history(user=Depends(get_current_user)):
    clear_history(user_id=user["id"])
    return {"success": True, "message": "Detection history cleared"}


@app.get("/api/history")
def detection_history(user=Depends(get_current_user)):

    records = get_recent_detections(
        limit=100, user_id=user["id"]
    )

    history = []

    for record in records:

        history.append({

            "timestamp": record[0],

            "crop": record[1],

            "disease": record[2],

            "confidence": round(
                record[3] * 100,
                2,
            ),

        })

    return {
        "total": len(history),
        "history": history,
    }


# =====================================================
# SAVED CONVERSATIONS
# =====================================================

@app.delete("/api/conversations")
def clear_all_conversations(user=Depends(get_current_user)):
    clear_conversation_history(user_id=user["id"])
    return {"success": True, "message": "AI conversation history cleared"}


@app.get("/api/conversations")
def saved_conversations(user=Depends(get_current_user)):

    conversations = get_conversations(
        limit=50, user_id=user["id"]
    )

    return {
        "conversations": conversations
    }


# =====================================================
# GROQ AI ASSISTANT — EXISTING AGENT + SQLITE
# =====================================================

class StartChatRequest(BaseModel):
    crop: str = Field(default="Unknown crop", max_length=100)
    disease: str = Field(default="Not yet diagnosed", max_length=200)
    confidence: float = Field(default=0, ge=0, le=100)
    language: str = "English"


class ChatMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class LanguageRequest(BaseModel):
    language: str


@app.get("/api/chat/languages")
def chat_languages():
    return {"languages": SUPPORTED_LANGUAGES}


@app.post("/api/chat/start")
def start_chat(request: StartChatRequest, user=Depends(get_current_user)):
    if request.language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail="Unsupported language")

    try:
        agent = PlantDiseaseAgent(
            crop=request.crop,
            disease=request.disease,
            confidence=request.confidence,
            language=request.language,
            user_id=user["id"],
        )
        response = agent.start_conversation()
        return {
            "conversation_id": agent.conversation_id,
            "reply": response,
            "language": agent.language,
            "messages": get_chat_messages(agent.conversation_id),
        }
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception:
        raise HTTPException(status_code=502, detail="Unable to start AI conversation")


@app.get("/api/chat/{conversation_id}")
def get_chat(conversation_id: int, user=Depends(get_current_user)):
    details = get_conversation(conversation_id, user_id=user["id"])
    if not details:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"conversation": details, "messages": get_chat_messages(conversation_id)}


@app.post("/api/chat/{conversation_id}/message")
def send_chat_message(conversation_id: int, request: ChatMessageRequest, user=Depends(get_current_user)):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    try:
        agent = PlantDiseaseAgent.resume_conversation(conversation_id, user_id=user["id"])
        reply = agent.ask(request.message.strip())
        return {"conversation_id": conversation_id, "reply": reply,
                "messages": get_chat_messages(conversation_id)}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception:
        raise HTTPException(status_code=502, detail="AI response unavailable")


@app.patch("/api/chat/{conversation_id}/language")
def change_chat_language(conversation_id: int, request: LanguageRequest, user=Depends(get_current_user)):
    if request.language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail="Unsupported language")
    try:
        agent = PlantDiseaseAgent.resume_conversation(conversation_id, user_id=user["id"])
        reply = agent.change_language(request.language)
        return {"conversation_id": conversation_id, "language": agent.language,
                "reply": reply, "messages": get_chat_messages(conversation_id)}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception:
        raise HTTPException(status_code=502, detail="Unable to change chat language")


@app.delete("/api/chat/{conversation_id}")
def remove_chat(conversation_id: int, user=Depends(get_current_user)):
    if not get_conversation(conversation_id, user_id=user["id"]):
        raise HTTPException(status_code=404, detail="Conversation not found")
    delete_conversation(conversation_id, user_id=user["id"])
    return {"success": True}




# =====================================================
# REAL DASHBOARD ANALYTICS — SQLITE
# =====================================================

@app.get("/api/dashboard/analytics")
def dashboard_analytics(period: str = "7d", user=Depends(get_current_user)):
    """
    Return analytics derived from saved SQLite detections.
    period: 7d, 30d, or all
    """
    if period not in {"7d", "30d", "all"}:
        raise HTTPException(
            status_code=400,
            detail="Period must be 7d, 30d, or all.",
        )

    records = get_recent_detections(limit=1000000, user_id=user["id"])

    now = datetime.now(timezone.utc)
    days = {"7d": 7, "30d": 30}.get(period)
    start_date = (now - timedelta(days=days - 1)).date() if days else None

    parsed = []
    for record in records:
        timestamp, crop, disease, confidence = record[:4]
        try:
            raw_timestamp = str(timestamp).strip().replace("Z", "+00:00")
            detected_at = datetime.fromisoformat(raw_timestamp)
            if detected_at.tzinfo is None:
                detected_at = detected_at.replace(tzinfo=timezone.utc)
            detected_at = detected_at.astimezone(timezone.utc)
        except (TypeError, ValueError):
            # Skip records whose timestamp cannot be interpreted.
            continue

        if start_date and detected_at.date() < start_date:
            continue

        parsed.append({
            "timestamp": detected_at,
            "date": detected_at.date().isoformat(),
            "crop": str(crop or "Unknown"),
            "disease": str(disease or "Unknown"),
            "confidence": float(confidence or 0),
        })

    # Daily trend. For 7d/30d, include zero-count days too.
    daily_counts = Counter(item["date"] for item in parsed)
    if days:
        trend = []
        for offset in range(days - 1, -1, -1):
            day = (now.date() - timedelta(days=offset))
            trend.append({
                "date": day.isoformat(),
                "label": day.strftime("%b %d"),
                "detections": daily_counts.get(day.isoformat(), 0),
            })
    else:
        trend = [
            {
                "date": day,
                "label": datetime.fromisoformat(day).strftime("%b %d, %Y"),
                "detections": count,
            }
            for day, count in sorted(daily_counts.items())
        ]

    # Group disease names; keep the five most common and aggregate the rest.
    disease_counts = Counter(item["disease"] for item in parsed)
    ranked = disease_counts.most_common()
    distribution = [
        {"name": name, "value": count}
        for name, count in ranked[:6]
    ]
    if len(ranked) > 6:
        distribution.append({
            "name": "Other",
            "value": sum(count for _, count in ranked[6:]),
        })

    healthy_count = sum(
        1 for item in parsed
        if "healthy" in item["disease"].lower()
    )
    total = len(parsed)

    recent_activity = [
        {
            "timestamp": item["timestamp"].isoformat(),
            "crop": item["crop"],
            "disease": item["disease"],
            "confidence": round(item["confidence"] * 100, 2),
            "healthy": "healthy" in item["disease"].lower(),
        }
        for item in sorted(
            parsed,
            key=lambda value: value["timestamp"],
            reverse=True,
        )[:8]
    ]

    return {
        "period": period,
        "total_detections": total,
        "healthy_plants": healthy_count,
        "diseased_plants": total - healthy_count,
        "trend": trend,
        "disease_distribution": distribution,
        "recent_activity": recent_activity,
        "generated_at": now.isoformat(),
    }




# =====================================================
# FULL DASHBOARD REPORT EXPORT — SQLITE
# =====================================================

@app.get("/api/dashboard/report")
def dashboard_report(period: str = "7d", user=Depends(get_current_user)):
    """Return every saved detection record in the selected report period."""
    if period not in {"7d", "30d", "all"}:
        raise HTTPException(
            status_code=400,
            detail="Period must be 7d, 30d, or all.",
        )

    records = get_recent_detections(limit=1000000, user_id=user["id"])
    now = datetime.now(timezone.utc)
    days = {"7d": 7, "30d": 30}.get(period)
    start_date = (now - timedelta(days=days - 1)).date() if days else None

    output = []
    for record in records:
        timestamp, crop, disease, confidence = record[:4]
        try:
            raw_timestamp = str(timestamp).strip().replace("Z", "+00:00")
            detected_at = datetime.fromisoformat(raw_timestamp)
            if detected_at.tzinfo is None:
                detected_at = detected_at.replace(tzinfo=timezone.utc)
            detected_at = detected_at.astimezone(timezone.utc)
        except (TypeError, ValueError):
            continue

        if start_date and detected_at.date() < start_date:
            continue

        disease_name = str(disease or "Unknown")
        output.append({
            "timestamp": detected_at.isoformat(),
            "crop": str(crop or "Unknown"),
            "disease": disease_name,
            "confidence": round(float(confidence or 0) * 100, 2),
            "healthy": "healthy" in disease_name.lower(),
        })

    output.sort(key=lambda item: item["timestamp"], reverse=True)
    return {
        "period": period,
        "total_records": len(output),
        "records": output,
        "generated_at": now.isoformat(),
    }

# =====================================================
# ROOT
# =====================================================

@app.get("/")
def root():

    return {
        "message": "PlantAI API is running",
        "documentation": "/docs",
    }