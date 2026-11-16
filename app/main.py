from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .game import FlappyGame

ROOT = Path(__file__).parent
app = FastAPI(title="Flappy NEAT Sandbox")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.get("/")
async def sandbox() -> FileResponse:
    return FileResponse(ROOT / "static" / "index.html")


@app.websocket("/ws/play")
async def play_session(websocket: WebSocket) -> None:
    await websocket.accept()
    game = FlappyGame()
    frame_time = 1 / 60

    try:
        while True:
            flap = False
            try:
                message = await asyncio.wait_for(websocket.receive_json(), timeout=frame_time)
                if message.get("type") == "flap":
                    flap = True
                elif message.get("type") == "reset":
                    game.reset()
            except TimeoutError:
                pass

            game.step(frame_time, flap)
            await websocket.send_json(game.snapshot())
    except WebSocketDisconnect:
        return
