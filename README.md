# Flappy, evolved.

An interactive Flappy Bird sandbox where you can fly the course yourself, then
watch a population of neural networks learn it in real time.

The goal is not just to show a score climbing. The Evolution Lab makes the
learning process legible: bird vision, species count, topology growth,
connection weights, node activations, jump decisions, and first-gate pass rate
all update from the active simulation.

## Highlights

- Clean, deterministic Flappy Bird physics running at 60 FPS.
- Human Flight mode with Space/click controls, a deliberate launch state, and
  persistent personal bests.
- NEAT population of 50 birds, rendered together against the same course.
- Live topology renderer for the leading genome, including activations,
  connection sign/strength, structural mutations, and jump threshold.
- Stable training course and centered first gate so progress is comparable from
  generation to generation.
- `1×`, `5×`, and Warp simulation controls plus champion save/load.

## Architecture

The backend is a deliberately small FastAPI service. It owns deterministic
physics and NEAT evaluation, then streams compact JSON state over WebSockets.
The frontend is dependency-free HTML, CSS, and Canvas 2D. This keeps the
visualization smooth without adding a client framework or a rendering engine.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`.

## Verify

```bash
python -m unittest discover -s tests -v
```

## Deploy

The repository includes both a `Dockerfile` and `render.yaml` for a straightforward
web-service deployment. For Render, connect this GitHub repository and deploy
the Blueprint. The application binds to the host-provided `PORT`, exposes a
`/health` endpoint, and serves HTTP plus WebSockets from the same service.

For a portfolio deployment, use a single application worker first. Each active
Evolution Lab session runs a real 50-agent simulation, so capacity should be
measured before increasing worker count or allowing unbounded Warp usage.
