import json
import hmac
import time
import uuid
from typing import Any
from urllib.parse import quote

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from config import settings
from services.llm_service import llm_service
from services.rag_service import rag_service
from services.token_build import AccessToken, PRIVILEGES
from services.utils import Signer


app = FastAPI(title="AI Voice Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_credentials=False,
    allow_methods=[],
    allow_headers=[],
)


@app.middleware("http")
async def protect_runtime(request: Request, call_next):
    path = request.url.path
    if path == "/health" or not (path.startswith("/getScenes") or path.startswith("/proxy") or path.startswith("/debug")):
        return await call_next(request)
    expected = settings.RUNTIME_CONTROL_TOKEN or ""
    if not expected:
        return JSONResponse(status_code=503, content={"detail": "Voice runtime control token is not configured"})
    provided = request.headers.get("X-Runtime-Token", "")
    if not hmac.compare_digest(provided, expected):
        return JSONResponse(status_code=401, content={"detail": "Voice runtime call is unauthorized"})
    return await call_next(request)


def require_settings(*names: str) -> None:
    missing = [name for name in names if not getattr(settings, name, None)]
    if missing:
        raise HTTPException(
            status_code=503,
            detail=f"Voice runtime is not configured: {', '.join(missing)}",
        )


def build_rtc_token(room_id: str, user_id: str) -> str:
    require_settings("RTC_APP_ID", "RTC_APP_KEY")
    token_builder = AccessToken(
        settings.RTC_APP_ID,
        settings.RTC_APP_KEY,
        room_id,
        user_id,
    )
    token_builder.add_privilege(PRIVILEGES["PrivSubscribeStream"], 0)
    token_builder.add_privilege(PRIVILEGES["PrivPublishStream"], 0)
    token_builder.expire_time(int(time.time()) + 3600)
    return token_builder.serialize()


@app.get("/health")
async def health() -> dict[str, Any]:
    rtc_ready = bool(settings.RTC_APP_ID and settings.RTC_APP_KEY)
    cloud_ready = bool(settings.VOLC_AK and settings.VOLC_SK)
    return {
        "status": "healthy",
        "service": "voice-service-runtime",
        "capabilities": {
            "rtc_token": rtc_ready,
            "voice_chat_control": rtc_ready and cloud_ready,
            "llm_callback": llm_service.configured,
            "rag": bool(settings.VOLC_AK and settings.VOLC_SK and settings.VOLC_ACCOUNT_ID),
        },
    }


@app.post("/getScenes")
async def get_scenes(request: Request) -> dict[str, Any]:
    require_settings("RTC_APP_ID", "RTC_APP_KEY")
    try:
        body = await request.json()
    except Exception:
        body = {}
    room_id = str(body.get("room_id") or f"room-{uuid.uuid4().hex[:16]}")
    user_id = str(body.get("user_id") or f"user-{uuid.uuid4().hex[:16]}")

    return {
        "ResponseMetadata": {"Action": "getScenes"},
        "Result": {
            "scenes": [{
                "scene": {
                    "id": "Custom",
                    "name": "智能运营助手",
                    "botName": settings.RTC_AGENT_USER_ID,
                    "icon": None,
                    "isInterruptMode": True,
                    "isVision": False,
                    "isScreenMode": False,
                    "isAvatarScene": None,
                    "avatarBgUrl": None,
                },
                "rtc": {
                    "AppId": settings.RTC_APP_ID,
                    "RoomId": room_id,
                    "UserId": user_id,
                    "Token": build_rtc_token(room_id, user_id),
                },
                "VoiceChat": {},
            }],
        },
    }


@app.post("/proxy")
async def proxy(request: Request) -> dict[str, Any]:
    action = request.query_params.get("Action")
    version = request.query_params.get("Version", "2024-12-01")
    if action not in {"StartVoiceChat", "StopVoiceChat"}:
        raise HTTPException(status_code=400, detail="Unsupported RTC action")

    require_settings("VOLC_AK", "VOLC_SK", "RTC_APP_ID")
    try:
        incoming = await request.json()
    except Exception:
        incoming = {}

    room_id = str(incoming.get("RoomId") or "")
    target_user_id = str(incoming.get("UserId") or "")
    if not room_id or not target_user_id:
        raise HTTPException(status_code=422, detail="RoomId and UserId are required")
    task_id = str(incoming.get("TaskId") or f"task-{uuid.uuid4().hex[:16]}")

    if action == "StartVoiceChat":
        require_settings("RTC_ASR_APP_ID", "RTC_TTS_APP_ID", "SERVER_URL", "VOICE_CALLBACK_TOKEN")
        request_body = {
            "AppId": settings.RTC_APP_ID,
            "RoomId": room_id,
            "TaskId": task_id,
            "AgentConfig": {
                "TargetUserId": [target_user_id],
                "WelcomeMessage": settings.RTC_WELCOME_MESSAGE,
                "UserId": settings.RTC_AGENT_USER_ID,
                "EnableConversationStateCallback": True,
            },
            "Config": {
                "ASRConfig": {
                    "Provider": "volcano",
                    "ProviderParams": {
                        "Mode": "smallmodel",
                        "AppId": settings.RTC_ASR_APP_ID,
                        "Cluster": "volcengine_streaming_common",
                    },
                },
                "TTSConfig": {
                    "Provider": "volcano",
                    "ProviderParams": {
                        "app": {
                            "appid": settings.RTC_TTS_APP_ID,
                            "cluster": settings.RTC_TTS_CLUSTER,
                        },
                        "audio": {
                            "voice_type": settings.RTC_TTS_VOICE_TYPE,
                            "speed_ratio": 1,
                            "pitch_ratio": 1,
                            "volume_ratio": 1,
                        },
                    },
                },
                "LLMConfig": {
                    "Mode": "CustomLLM",
                    "Url": f"{settings.SERVER_URL}/api/chat_callback?token={quote(settings.VOICE_CALLBACK_TOKEN, safe='')}",
                    "Method": "POST",
                    "ApiType": "https" if settings.SERVER_URL.startswith("https") else "http",
                },
                "InterruptMode": 0,
            },
        }
    else:
        request_body = {
            "AppId": settings.RTC_APP_ID,
            "RoomId": room_id,
            "TaskId": task_id,
        }

    host = "rtc.volcengineapi.com"
    signed_request = {
        "method": "POST",
        "path": "/",
        "params": {"Action": action, "Version": version},
        "headers": {"Host": host, "Content-Type": "application/json"},
        "body": request_body,
    }
    signer = Signer(signed_request, "rtc")
    signer.add_authorization({"accessKeyId": settings.VOLC_AK, "secretKey": settings.VOLC_SK})

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"https://{host}",
            params=signed_request["params"],
            headers=signed_request["headers"],
            json=request_body,
        )
    try:
        payload = response.json()
    except ValueError as error:
        raise HTTPException(status_code=502, detail="Invalid RTC provider response") from error
    if response.is_error:
        raise HTTPException(status_code=502, detail=payload)
    return payload


async def stream_llm(messages: list[dict[str, str]]):
    if not llm_service.configured:
        raise HTTPException(status_code=503, detail="ARK_API_KEY and ARK_ENDPOINT_ID are required")
    question = messages[-1].get("content", "")
    rag_content = await rag_service.retrieve(question)
    for chunk in llm_service.chat_stream(messages, rag_content):
        if chunk is not None:
            yield chunk


@app.post("/api/chat_callback")
async def chat_callback(request: Request):
    expected = settings.VOICE_CALLBACK_TOKEN or ""
    provided = request.query_params.get("token", "")
    if not expected or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Voice callback is unauthorized")
    try:
        data = await request.json()
    except Exception as error:
        raise HTTPException(status_code=400, detail="Invalid callback payload") from error
    messages = data.get("messages", [])
    if not messages or messages[-1].get("role") != "user":
        return {"text": ""}

    async def generate_sse():
        async for chunk in stream_llm(messages):
            yield f"data: {chunk.model_dump_json()}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate_sse(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


class ChatMessage(BaseModel):
    role: str
    content: str


class DebugRequest(BaseModel):
    history: list[ChatMessage] = Field(default_factory=list)
    question: str


@app.post("/debug/chat")
async def debug_chat(payload: DebugRequest):
    messages = [message.model_dump() for message in payload.history]
    messages.append({"role": "user", "content": payload.question})

    async def generate_text():
        async for chunk in stream_llm(messages):
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    return StreamingResponse(generate_text(), media_type="text/plain")


@app.get("/debug/rag")
async def debug_rag(query: str) -> dict[str, Any]:
    context = await rag_service.retrieve(query)
    return {
        "query": query,
        "retrieved_context": context,
        "length": len(context),
        "status": "success" if context else "no_results_or_not_configured",
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8103)
