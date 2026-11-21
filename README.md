# Flappy NEAT

A Flappy Bird game you can play yourself, or watch a population of neural networks learn to play with NEAT (NeuroEvolution of Augmenting Topologies). Everything, including the evolution, runs in the browser as static files, so there is no server to keep alive and nothing to cold-start.

**Live:** [project-flappy-bird-neat-evolution.vercel.app](https://project-flappy-bird-neat-evolution.vercel.app). The [method page](https://project-flappy-bird-neat-evolution.vercel.app/method.html) explains how the birds see, decide and evolve.

## Modes

**Play** runs the same physics and course generator the AI trains on, at a fixed 60 Hz step, and remembers your best score. Once evolution has produced a champion, you can turn on a ghost and race it on the same course.

**Evolve** flies a population of 25 to 200 birds at once. The side panel shows the leading bird's network as it makes decisions, with brighter lines carrying stronger signals and dashed lines for negative weights, plus the best score of every generation. You can pause, restart and change the speed, and a Settings section holds the number of birds, the mutation rate, roughly how many species to aim for, and whether each generation gets a new course.

## The model

| | |
|---|---|
| Inputs | distance to the next gap's centre, vertical speed, distance until clear of the next pipe, distance to the gap after that |
| Output | one sigmoid unit, and the bird flaps when it is above 0.5 |
| Fitness | seconds survived, plus 2 per pipe, plus up to 1 for crashing close to the gap |
| Course | first gap centred, then gaps shrink from 176 px to 122 px over 60 pipes as the allowed jump between gaps grows |
| Generation ends | when every bird has crashed or the survivors clear 100 pipes |

The NEAT implementation in [`public/js/neat.js`](public/js/neat.js) covers innovation numbers shared across the run, add-connection and add-node mutation with cycle checks, crossover aligned by innovation number, speciation with a self-adjusting distance threshold, fitness sharing, stagnation and an unchanged elite. With a population of 50, runs on six test seeds clear all 100 pipes within 2 to 16 generations.

## Layout

```
public/
  index.html, style.css, method.html
  js/world.js     physics and course generation, shared by both modes
  js/neat.js      genomes, mutation, crossover, speciation, network evaluation
  js/trainer.js   sensors, fitness and generation bookkeeping
  js/render.js    playfield drawing with interpolation between physics steps
  js/viz.js       network, history and species charts
  js/app.js       modes, input, controls and the frame loop
tests/            node:test suites for the three core modules
scripts/serve.js  zero-dependency local server
```

## Run it

Requires Node 20 or newer and has no dependencies to install.

```bash
npm run dev     # http://localhost:8000
npm test        # 20 tests, including one that checks NEAT actually clears the course
```

Vercel deploys `public/` as a static site. [`vercel.json`](vercel.json) sets the framework to none and skips the install and build steps, which overrides whatever the dashboard has saved. That matters for this project, because Vercel detected it as FastAPI back when it had a Python backend, and that preset fails with `FASTAPI_ENTRYPOINT_NOT_FOUND` now that there is no Python entrypoint. Any other static host works by serving `public/` as is.
