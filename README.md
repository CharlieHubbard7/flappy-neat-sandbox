# Flappy, evolved

A Flappy Bird clone you can play yourself, or watch a population of neural networks learn with NEAT (NeuroEvolution of Augmenting Topologies).

**Live:** [project-flappy-bird-neat-evolution.vercel.app](https://project-flappy-bird-neat-evolution.vercel.app). A [method page](https://project-flappy-bird-neat-evolution.vercel.app/method.html) walks through how NEAT works.

## What you can do

- **Fly it yourself.** The human mode runs entirely in the browser, at a fixed 60 Hz physics step, and remembers your best score.
- **Watch 50 birds evolve.** In AI mode, each bird is a NEAT genome. They all fly the same course at once, and the side panel shows:
  - generation, birds alive, species count, best and average fitness, and how many birds passed the first gate;
  - the leading bird's live inputs and jump output;
  - its actual network, drawn from the genome with weights colored by sign and sized by magnitude. New connections are highlighted when they appear.
- **Change the run as it goes:**
  - simulation speed (1×, 4× or 12×);
  - how strictly birds are grouped into species (the compatibility threshold);
  - how often new connections and nodes are added.

## The model

| | |
|---|---|
| Population | 50 genomes ([`app/neat_config.ini`](app/neat_config.ini), tanh activations) |
| Inputs | vertical velocity, horizontal distance to the next pipe, distance to the top and bottom of the gap (normalized) |
| Output | one value; the bird flaps when it is above 0.5 |
| Fitness | +1 per second survived, +20 per pipe passed, a small bonus for staying near the gap center, and a penalty for crashing |

The pipe sequence is seeded and the same every generation, and the first gap is centered. Changes in first-gate pass rate therefore reflect learning, not an easier course.

## How it's built

- **Backend:** Python, running `neat-python` and the game physics in FastAPI. The browser connects over a WebSocket, and the server sends state about 20 times a second, advancing several physics frames per update. The network drawing is sent on every tenth update because it changes slowly. The browser interpolates between updates, so motion stays smooth.
- **Frontend:** plain HTML, CSS and Canvas 2D, in [`public/`](public/).
- **Deployment:** Vercel serves `public/` as static files, and [`api/index.py`](api/index.py) exposes the FastAPI app as a serverless function. Each evolution run belongs to one WebSocket connection, so it isn't saved anywhere.
- **Persistent hosting:** a `Dockerfile` and `render.yaml` are included for running it as a long-lived service.

## Run it

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload            # http://127.0.0.1:8000
python -m unittest discover -s tests     # 9 tests
```
