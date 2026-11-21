# Flappy NEAT

Flappy NEAT is a Flappy Bird game you can either play yourself or hand over to a population of small neural networks that learn to play it through NEAT, the NeuroEvolution of Augmenting Topologies method that Kenneth Stanley and Risto Miikkulainen published in 2002. Everything, including the evolution, runs in the browser as static files, which means there is no server to keep alive and nothing to cold-start, and it is also why an earlier version that ran NEAT in Python behind a WebSocket never worked on Vercel, since Vercel's functions don't hold those connections open.

The live site is at [project-flappy-bird-neat-evolution.vercel.app](https://project-flappy-bird-neat-evolution.vercel.app), and its [How it works](https://project-flappy-bird-neat-evolution.vercel.app/method.html) page explains the method in more depth and makes the argument summarised at the end of this file.

## What it does

Play mode runs the same physics and course generator that the networks train on, stepping at a fixed 60 Hz so a given course always behaves the same way, and it remembers your best score in the browser. Once evolution has produced a bird that does well, you can switch on a ghost of it and race it on the same course, which is a more direct comparison than reading two scores side by side.

Evolve mode flies between 25 and 200 birds at once and shows the leading bird's network as it makes decisions, with brighter lines carrying stronger signals and dashed lines for negative weights, alongside the best score of every generation. You can pause, restart and change the speed from 1× up to as fast as the machine allows, while a Settings section holds the number of birds, the mutation rate, roughly how many species to aim for, and whether each generation gets a new course or replays the same one.

## How the birds learn

Each bird sees four numbers on every frame, which are its height relative to the centre of the next gap, its vertical speed, the distance left before it clears the next pipe, and its height relative to the gap after that, and it flaps whenever its single sigmoid output is above 0.5. Its fitness is the seconds it survived plus 2 for each pipe cleared plus up to 1 for crashing close to a gap, and a generation ends once every bird has crashed or the survivors clear 100 pipes. The course tightens over its first 60 pipes, with gaps shrinking from 176 px to 122 px, because without that ramp some populations solved the whole thing in their first generation.

The NEAT implementation in [`public/js/neat.js`](public/js/neat.js) covers innovation numbers shared across the run, mutations that add connections and nodes while checking for cycles, crossover that lines genes up by innovation number, speciation with a distance threshold that adjusts itself toward a target species count, fitness sharing, retirement of stagnant species, and an elite bird copied unchanged into each new generation. With 50 birds it cleared all 100 pipes in a median of 10 generations across 20 seeded runs, with a range of 3 to 16.

## Why this is a weak test of NEAT

That result says less about NEAT than it seems to, because this version of Flappy Bird is deterministic and fully visible to the bird, so the right action at any moment is a fixed function of the current inputs and there is no hidden state for a network to discover. The evidence is fairly blunt. A one-line rule that flaps whenever the next gap's centre is more than 22 px above the bird clears every one of 200 random courses without using speed, distance or the second gap, and turning off NEAT's structural mutations so that it can only tune the starting four weights and one bias barely matters, since that version solved the course in a median of 11 generations against 10 for full NEAT. The hidden nodes that 18 of the 20 full-NEAT winners grew are therefore mostly passengers rather than structure the task needs.

The fair counterpoint is that the problem is narrow rather than trivial, since only 7 of 61 thresholds clear every course and just 1 of 5,000 randomly drawn networks clears 100 pipes on five courses, so selection is doing real search even if that search mostly amounts to tuning a weight or two. Small departures from determinism change the picture quickly, because delaying every flap by 2 frames, or adding about 10 px of noise to the gap sensor, drops the best one-line rule from 200 of 200 courses cleared to none, which makes those the natural next experiments for testing what NEAT can actually do. `npm run experiments` reruns every number in this section in about 20 seconds.

## Files

```
public/
  index.html, style.css, method.html
  js/world.js     physics and course generation, shared by both modes
  js/neat.js      genomes, mutation, crossover, speciation, network evaluation
  js/trainer.js   sensors, fitness and generation bookkeeping
  js/render.js    playfield drawing with interpolation between physics steps
  js/viz.js       network and history charts
  js/app.js       modes, input, controls and the frame loop
tests/                   node:test suites for the three core modules
scripts/serve.js         zero-dependency local server
scripts/experiments.js   the numbers behind the critique above
```

## Running and deploying

The project needs Node 20 or newer and has no dependencies to install.

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run experiments
```

The first command serves the site at http://localhost:8000, the second runs 20 tests, including one that checks NEAT actually clears the course, and the third reproduces the experiments.

Vercel deploys `public/` as a static site, and [`vercel.json`](vercel.json) sets the framework to none and skips the install and build steps so that it overrides whatever the dashboard has saved. That matters for this repository in particular, because Vercel detected it as a FastAPI project back when it had a Python backend, and that saved preset fails with `FASTAPI_ENTRYPOINT_NOT_FOUND` now that no Python entrypoint exists. Any other static host works by serving `public/` as it is.
