import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from core.websocket_manager import ws_manager

ws_router = APIRouter()
logger = logging.getLogger("jarvis.ws")


@ws_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    logger.info("WebSocket client connected. Total: %d", len(ws_manager.active_connections))
    try:
        await ws_manager.send_personal(websocket, "connected", {
            "message": "JARVIS WebSocket connection established. All systems online."
        })
        while True:
            data = await websocket.receive_text()
            # Echo back for keep-alive pings
            await ws_manager.send_personal(websocket, "pong", {})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
        logger.info("WebSocket client disconnected. Total: %d", len(ws_manager.active_connections))
