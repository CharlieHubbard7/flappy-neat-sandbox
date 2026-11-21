import assert from "node:assert/strict";
import { test } from "node:test";

import { Trainer, championNetwork, sense } from "../public/js/trainer.js";
import { World } from "../public/js/world.js";

function runGenerations(trainer, count) {
  const target = trainer.generation + count;
  while (trainer.generation < target) trainer.step();
}

test("a run is fully determined by its seed", () => {
  const a = new Trainer({ seed: 5, populationSize: 20 });
  const b = new Trainer({ seed: 5, populationSize: 20 });
  runGenerations(a, 4);
  runGenerations(b, 4);
  assert.deepEqual(a.history, b.history);
});

test("sensor values stay in range", () => {
  const world = new World(2, 1);
  const out = new Float64Array(4);
  for (let i = 0; i < 3000 && world.birds[0].alive; i += 1) {
    sense(world, world.birds[0], out);
    assert.ok(out[0] >= -1 && out[0] <= 1);
    assert.ok(out[1] >= -1 && out[1] <= 1);
    assert.ok(out[2] >= 0 && out[2] <= 1.5);
    assert.ok(out[3] >= -1 && out[3] <= 1);
    world.step([out[0] < 0 && world.birds[0].vy > -100 ? 1 : 0]);
  }
});

test("NEAT learns to clear the course", () => {
  // Across six seeds the run clears 100 pipes within 2 to 16 generations;
  // 40 gives every seed here a wide margin.
  for (const seed of [1, 2, 3]) {
    const trainer = new Trainer({ seed, populationSize: 50, maxScore: 100 });
    while (trainer.record < 100 && trainer.generation < 40) trainer.step();
    assert.equal(trainer.record, 100, `seed ${seed} best ${trainer.record} after ${trainer.generation} generations`);
  }
});

test("the saved champion flies the play-mode course", () => {
  const trainer = new Trainer({ seed: 1, populationSize: 50, maxScore: 100 });
  while (trainer.record < 100 && trainer.generation < 40) trainer.step();
  const champion = JSON.parse(JSON.stringify(trainer.champion));
  const network = championNetwork(champion);
  const world = new World(trainer.courseSeed(champion.generation), 1);
  const inputs = new Float64Array(4);
  while (world.birds[0].alive && world.score < 100) {
    sense(world, world.birds[0], inputs);
    world.step([network.activate(inputs) > 0.5 ? 1 : 0]);
  }
  assert.equal(world.score, 100);
});

test("generations never stall: a population that cannot die is capped", () => {
  const trainer = new Trainer({ seed: 2, populationSize: 10, maxScore: 3 });
  runGenerations(trainer, 3);
  assert.equal(trainer.history.length, 3);
  for (const entry of trainer.history) assert.ok(entry.best <= 3);
});

test("live tuning changes the real NEAT options", () => {
  const trainer = new Trainer({ seed: 1, populationSize: 10 });
  trainer.tune({ mutation: "high", species: "many", course: "fixed" });
  assert.equal(trainer.population.options.addConnectionRate, 0.3);
  assert.equal(trainer.population.options.targetSpecies, 10);
  assert.equal(trainer.courseSeed(3), trainer.courseSeed(9));
});
