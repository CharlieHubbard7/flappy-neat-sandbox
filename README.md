# Flappy Bird NEAT Evolution Sandbox

A local FastAPI + canvas sandbox for playing Flappy Bird and watching NEAT
evolve a population of neural networks in real time.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`.
