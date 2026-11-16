from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from .game import FlappyGame

ROOT = Path(__file__).parent
PUBLIC = ROOT.parent / "public"
app = FastAPI(title="Flappy NEAT Sandbox")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws/play")
async def play_session(websocket: WebSocket) -> None:
    await websocket.accept()
    game = FlappyGame(waiting=True)
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
    # Importing NEAT only after the AI mode is selected keeps the first human
    # interaction small and responsive on serverless cold starts.
    from .evolution import EvolutionRunner

    await websocket.accept()
    runner = EvolutionRunner()
    updates = 0

    try:
        while True:
            try:
                await asyncio.wait_for(websocket.receive_json(), timeout=1 / 20)
            except TimeoutError:
                pass

            # Small, regular updates let the browser interpolate at display
            # refresh rate without sending every physics tick across the wire.
            runner.tick(3)
            updates += 1
            await websocket.send_json({"type": "state", **runner.snapshot(include_graph=updates % 10 == 1)})
    except WebSocketDisconnect:
        return


# Vercel serves ``public/`` from its edge cache and leaves it out of the
# function bundle. Locally, FastAPI owns those same files for one-command dev.
if PUBLIC.is_dir():
    app.mount("/", StaticFiles(directory=PUBLIC, html=True), name="public")
