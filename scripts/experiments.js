// Reproduces the numbers in the "Why this is a weak test of NEAT" section of
// public/method.html. Run with `npm run experiments` (about 20 seconds).
import { Network, Population } from "../public/js/neat.js";
import { Trainer, sense } from "../public/js/trainer.js";
import { createRng } from "../public/js/rng.js";
import { World } from "../public/js/world.js";

const range = (start, count) => Array.from({ length: count }, (_, i) => start + i);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function fly(policy, seed, cap = 100) {
  const world = new World(seed, 1);
  const inputs = new Float64Array(4);
  while (world.birds[0].alive && world.score < cap) {
    sense(world, world.birds[0], inputs);
    world.step([policy(inputs) ? 1 : 0]);
  }
  return world.score;
}

// 1. A one-line rule: flap when the next gap's centre is more than k above you.
const courses = range(5000, 200);
const working = [];
for (let i = -30; i <= 30; i += 1) {
  const k = i / 100;
  if (courses.every((seed) => fly((x) => x[0] < -k, seed) >= 100)) working.push(Math.round(k * 320));
}
console.log(`one-line rule: ${working.length} of 61 thresholds clear all ${courses.length} courses (${working[0]} to ${working.at(-1)} px)`);

// 2. Random networks drawn the way generation one is drawn.
const population = new Population({ populationSize: 5000 }, 7);
const solvers = population.genomes.filter((genome) => {
  const network = new Network(genome);
  return range(1000, 5).every((seed) => fly((x) => network.activate(x) > 0.5, seed) >= 100);
}).length;
console.log(`random generation-one networks: ${solvers} of 5000 clear all 100 pipes on 5 courses`);

// 3. Full NEAT against weight-only evolution (no new connections or nodes).
function generationsToSolve(seed, frozen) {
  const trainer = new Trainer({ seed, populationSize: 50 });
  if (frozen) Object.assign(trainer.population.options, { addNodeRate: 0, addConnectionRate: 0 });
  while (trainer.record < 100 && trainer.generation < 80) trainer.step();
  const hidden = trainer.champion.genome.nodes.filter((node) => node.type === "hidden").length;
  return { generation: trainer.recordGeneration + 1, solved: trainer.record >= 100, hidden };
}
for (const frozen of [false, true]) {
  const runs = range(1, 20).map((seed) => generationsToSolve(seed, frozen));
  const gens = runs.map((run) => run.generation);
  const label = frozen ? "weights only" : "full NEAT";
  const extra = frozen
    ? ""
    : `, ${runs.filter((run) => run.hidden > 0).length} of 20 winners have hidden nodes (mean ${(runs.reduce((sum, run) => sum + run.hidden, 0) / 20).toFixed(1)})`;
  console.log(`${label}: ${runs.filter((run) => run.solved).length} of 20 solved, median generation ${median(gens)}, range ${Math.min(...gens)} to ${Math.max(...gens)}${extra}`);
}

// 4. On a fixed course the carried-over champion can never score less.
const fixed = new Trainer({ seed: 3, populationSize: 50, course: "fixed" });
while (fixed.generation < 30) fixed.step();
const best = fixed.history.map((entry) => entry.best);
const dips = best.filter((value, i) => i > 0 && value < best[i - 1]).length;
console.log(`fixed course, 30 generations: best ${best[0]} -> 100 by generation ${best.indexOf(100) + 1}, ${dips} dips`);

// 5. On fresh courses, how often does an already-solved population fall short?
let after = 0;
let short = 0;
let worst = 100;
for (const seed of range(1, 20)) {
  const trainer = new Trainer({ seed, populationSize: 50 });
  while (trainer.generation < 40) trainer.step();
  const first = trainer.history.findIndex((entry) => entry.best >= 100);
  for (const entry of trainer.history.slice(first + 1)) {
    after += 1;
    if (entry.best < 100) {
      short += 1;
      worst = Math.min(worst, entry.best);
    }
  }
}
console.log(`fresh courses after first solve: ${short} of ${after} generations fell short of 100 (worst ${worst})`);

// 6. Small departures from determinism break the one-line rule: a flap that
// lands a few frames late, or noise on the gap sensor (0.03 is about 10 px).
function flyRule(k, seed, { delay = 0, noise = 0 }) {
  const world = new World(seed, 1);
  const inputs = new Float64Array(4);
  const rng = createRng(seed * 7 + 1);
  const queue = Array(delay).fill(0);
  while (world.birds[0].alive && world.score < 100) {
    sense(world, world.birds[0], inputs);
    queue.push(inputs[0] + rng.gauss() * noise < -k ? 1 : 0);
    world.step([queue.shift()]);
  }
  return world.score;
}
for (const condition of [{ delay: 2 }, { noise: 0.03 }]) {
  let best = { cleared: -1, mean: 0 };
  for (let i = -30; i <= 30; i += 1) {
    const scores = courses.map((seed) => flyRule(i / 100, seed, condition));
    const cleared = scores.filter((score) => score >= 100).length;
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    if (cleared > best.cleared || (cleared === best.cleared && mean > best.mean)) best = { cleared, mean };
  }
  console.log(`one-line rule with ${JSON.stringify(condition)}: best threshold clears ${best.cleared} of ${courses.length} courses, mean score ${best.mean.toFixed(0)}`);
}
