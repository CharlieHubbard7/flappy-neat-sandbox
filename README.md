# Flappy NEAT

A Flappy Bird game you can play yourself, or watch a population of neural networks learn to play with NEAT (NeuroEvolution of Augmenting Topologies). Everything, including the evolution, runs in the browser as static files, so there is no server to keep alive and nothing to cold-start.

**Live:** [project-flappy-bird-neat-evolution.vercel.app](https://project-flappy-bird-neat-evolution.vercel.app). The [method page](https://project-flappy-bird-neat-evolution.vercel.app/method.html) explains how the birds see, decide and evolve.

## Modes

**Play** runs the same physics and course generator the AI trains on, at a fixed 60 Hz step, and remembers your best score. Once evolution has produced a champion, you can turn on a ghost and race it on the same course.

**Evolve** flies a population of 25 to 200 genomes at once. The panel shows the leading bird's network as it fires, with node brightness for activation, line weight for connection strength and dashes for negative weights, alongside its four live sensor values, the best and mean score of every generation, and the current species split. You can change speed (1×, 4×, 16×, or as fast as the machine allows), structural mutation rate, target species count and whether every generation flies the same course or a new one. Population size restarts the run, and the other settings apply from the next generation.

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

Vercel deploys `public/` as a static site using [`vercel.json`](vercel.json). Any other static host works the same way.
