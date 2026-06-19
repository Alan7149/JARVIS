import io
import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from core.config import settings

router = APIRouter()
logger = logging.getLogger("jarvis.voice")

_whisper_model = None


def _get_whisper():
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            _whisper_model = WhisperModel(settings.WHISPER_MODEL, device="cpu", compute_type="int8")
            logger.info("Whisper model loaded: %s", settings.WHISPER_MODEL)
        except ImportError:
            raise HTTPException(status_code=503, detail="faster-whisper not installed. Run: pip install faster-whisper")
    return _whisper_model


@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    try:
        model = _get_whisper()
        content = await file.read()
        with tempfile.NamedTemporaryFile(suffix=Path(file.filename or "audio.wav").suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        segments, info = model.transcribe(tmp_path, beam_size=5)
        text = " ".join(segment.text for segment in segments).strip()

        import os
        os.unlink(tmp_path)

        return {"transcript": text, "language": info.language}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Transcription error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


class TTSRequest(BaseModel):
    text: str
    engine: str | None = None


@router.post("/speak")
async def text_to_speech(request: TTSRequest):
    engine = request.engine or settings.TTS_ENGINE

    if engine == "elevenlabs":
        if not settings.ELEVENLABS_API_KEY:
            raise HTTPException(status_code=503, detail="ElevenLabs API key not configured")
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{settings.ELEVENLABS_VOICE_ID}",
                headers={"xi-api-key": settings.ELEVENLABS_API_KEY},
                json={"text": request.text, "model_id": "eleven_monolingual_v1"},
                timeout=30,
            )
        from fastapi.responses import Response
        return Response(content=response.content, media_type="audio/mpeg")

    raise HTTPException(status_code=503, detail=f"TTS engine '{engine}' not yet configured")
