# Flappy, evolved.

An interactive Flappy Bird sandbox where you can fly the course yourself, then
watch a population of neural networks learn it in real time.

The goal is not just to show a score climbing. The Evolution Lab makes the
learning process legible: bird vision, species count, topology growth,
connection weights, node activations, jump decisions, and first-gate pass rate
all update from the active simulation.

## Portfolio summary

I built AI Flappy Bird as a compact way to make neuroevolution feel tangible.
Rather than presenting NEAT as an opaque training job with a final score, I
made the simulation itself the interface: visitors can fly the exact course
with the same physics, switch to AI mode, and watch a population of small
networks make the same decision in parallel.

The project is deliberately split between an immediate, browser-native Human
mode and an on-demand Python evolution service. That keeps the first
interaction fast while preserving a real, inspectable training loop once AI
mode is selected.

### How it works

#### A deterministic shared world

Both modes use the same 480 × 640 course, fixed timestep, gravity, flap force,
pipe spacing, collision radius, and seeded pipe sequence. The first gate is
centered so every run has a readable opening condition. Later gates use the
same seeded variation every generation; that makes metrics such as first-gate
pass rate comparable instead of letting a fortunate pipe layout look like
learning.

Human mode runs entirely in the browser. A `requestAnimationFrame` loop drives
the Canvas renderer while a fixed 60 Hz physics step keeps input responsive and
reproducible. The player’s personal best lives in local storage. No request is
made to the Python service until AI mode is selected.

#### The evolving policy

AI mode creates a population of 50 NEAT genomes. Each genome controls one bird
through four normalized inputs: vertical velocity (`vy`), horizontal distance
to the next pipe (`dx`), clearance to the upper edge (`dy top`), and clearance
to the lower edge (`dy bottom`). Its single output is the jump signal. When
that output crosses 0.5, the bird flaps.

Fitness combines survival time, a small reward for staying near the next gap
center, and a much larger reward for passing a pipe. The large pipe-pass bonus
prevents a cautious bird that merely survives near the first gate from being
mistaken for a successful policy. At the end of each generation, NEAT selects
and crosses successful genomes, mutates weights and structure, and uses
speciation to protect new structures long enough to demonstrate whether they
help.

#### Making the model legible

The right-hand panel reports the population state—generation, surviving birds,
species, fitness, first-gate passes, active nodes, and enabled connections. It
also shows the leading bird’s live sensor values and jump output. The topology
view is not a mock-up: it is built from the leader’s actual genome. Teal edges
are positive weights, coral edges are negative weights, line thickness follows
weight magnitude, and gold briefly marks a new connection.

The backend advances three physics frames per visual update and sends compact
state packets at roughly 20 Hz. The browser interpolates each bird and pipe
between those packets at display refresh rate, so the canvas remains smooth
without streaming every physics frame or redrawing a large network payload on
every tick. Topology data arrives less frequently than position data because it
changes much less often.

#### Deployment model

The interface lives in `public/`, which Vercel serves as static assets. The
Python entry point is a small FastAPI serverless function used only for health
checks and the `/ws/evolution` WebSocket. The NEAT engine is imported lazily
after the visitor chooses AI mode, avoiding that cost for Human Play. An active
evolution session is intentionally ephemeral: it belongs to that WebSocket
connection, so long-running shared training or durable champion storage would
be the next step for a persistent backend deployment.

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

## Deploy on Vercel

The repository is ready to import into Vercel. It uses Vercel's native FastAPI
runtime: there is no build command to configure and the application entry point
is the thin `api/index.py` adapter, which imports the same `app.main:app` ASGI
application used locally.

1. In Vercel, choose **Add New → Project** and import
   `CharlieHubbard7/flappy-neat-sandbox`.
2. Leave the detected FastAPI settings unchanged and deploy. The included
   native Python discovery includes the Canvas assets and NEAT config.
3. After deployment, open `/health` to confirm the service is live.

Or deploy from the repository root with the Vercel CLI:

```bash
vercel --prod
```

The game connects over secure WebSockets automatically when it is served over
HTTPS. Vercel is excellent for sharing the portfolio experience, but its
serverless runtime is intentionally short-lived: an active simulation can be
restarted by the platform and champion files are not durable across function
restarts. For persistent champions or uninterrupted long-running training, use
the included container deployment described below.

## Deploy as a persistent service

The repository includes both a `Dockerfile` and `render.yaml` for a straightforward
web-service deployment. For Render, connect this GitHub repository and deploy
the Blueprint. The application binds to the host-provided `PORT`, exposes a
`/health` endpoint, and serves HTTP plus WebSockets from the same service.

For a portfolio deployment, use a single application worker first. Each active
Evolution Lab session runs a real 50-agent simulation, so capacity should be
measured before increasing worker count or allowing unbounded Warp usage.
