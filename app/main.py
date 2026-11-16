from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .evolution import EvolutionRunner
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


@app.websocket("/ws/evolution")
async def evolution_session(websocket: WebSocket) -> None:
    await websocket.accept()
    runner = EvolutionRunner()
    frames_per_tick = 1

    try:
        while True:
            try:
                message = await asyncio.wait_for(websocket.receive_json(), timeout=1 / 30)
                kind = message.get("type")
                if kind == "toggle":
                    runner.paused = not runner.paused
                elif kind == "speed":
                    frames_per_tick = {"1": 1, "5": 5, "warp": 1_500}.get(message.get("value"), 1)
                elif kind == "reset":
                    runner.reset()
                elif kind == "save":
                    await websocket.send_json({"type": "saved", "ok": runner.save_champion()})
                elif kind == "load":
                    await websocket.send_json({"type": "loaded", "ok": runner.load_champion()})
            except TimeoutError:
                pass

            runner.tick(frames_per_tick)
            await websocket.send_json({"type": "state", **runner.snapshot()})
    except WebSocketDisconnect:
        return
