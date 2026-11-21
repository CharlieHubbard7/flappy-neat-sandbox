import assert from "node:assert/strict";
import { test } from "node:test";

import { CONFIG, World, difficulty } from "../public/js/world.js";

const flapsAt = (frames) => (frame) => [frames.has(frame) ? 1 : 0];

function run(world, frames, steps) {
  const plan = flapsAt(frames);
  for (let frame = 0; frame < steps; frame += 1) world.step(plan(frame));
  return world;
}

test("the same seed and the same flaps give the same run", () => {
  const flaps = new Set([5, 40, 70, 100, 130, 160]);
  const a = run(new World(42), flaps, 240);
  const b = run(new World(42), flaps, 240);
  assert.deepEqual(a.birds, b.birds);
  assert.deepEqual(a.pipes, b.pipes);
});

test("different seeds give different courses after the first pipe", () => {
  const a = new World(1);
  const b = new World(2);
  assert.equal(a.pipes[0].gapY, CONFIG.height / 2);
  assert.equal(b.pipes[0].gapY, CONFIG.height / 2);
  assert.notDeepEqual(a.pipes.slice(1).map((p) => p.gapY), b.pipes.slice(1).map((p) => p.gapY));
});

test("a flap sets upward velocity and gravity pulls back down", () => {
  const world = new World(1);
  world.step([1]);
  assert.ok(world.birds[0].vy < 0);
  for (let i = 0; i < 30; i += 1) world.step([0]);
  assert.ok(world.birds[0].vy > 0);
});

test("falling without flapping hits the floor and stops the bird", () => {
  const world = new World(1);
  let frames = 0;
  while (world.birds[0].alive && frames < 600) {
    world.step([0]);
    frames += 1;
  }
  assert.equal(world.birds[0].alive, false);
  assert.equal(world.aliveCount, 0);
  const y = world.birds[0].y;
  world.step([0]);
  assert.equal(world.birds[0].y, y);
});

test("there are always two pipes ahead for the sensors", () => {
  const world = new World(9, 1);
  for (let i = 0; i < 5000; i += 1) {
    world.step([0]);
    const [next, after] = world.upcoming();
    assert.ok(next && after, `missing pipe at step ${i}`);
    assert.ok(after.x > next.x);
  }
});

test("a bird held in the gap scores once per pipe", () => {
  const world = new World(3);
  let cleared = 0;
  for (let i = 0; i < 2000; i += 1) {
    // Pin the bird to the next gap's centre: tests scoring, not flying.
    const bird = world.birds[0];
    bird.y = world.upcoming()[0].gapY;
    bird.vy = 0;
    world.step([0]);
    cleared = world.pipes.filter((p) => p.cleared).length;
  }
  assert.ok(world.birds[0].alive);
  assert.ok(world.birds[0].score >= 10);
  assert.equal(world.birds[0].score, world.score);
  assert.ok(cleared <= world.score);
});

test("gaps tighten over the ramp and stay inside the field", () => {
  assert.equal(difficulty(CONFIG, 1).gap, CONFIG.gapStart);
  assert.equal(difficulty(CONFIG, CONFIG.rampPipes + 1).gap, CONFIG.gapEnd);
  assert.equal(difficulty(CONFIG, 500).gap, CONFIG.gapEnd);
  const world = new World(11);
  while (world.pipeCount < 200) world._spawn(world.pipes.at(-1).x + CONFIG.pipeSpacing);
  for (const pipe of world.pipes) {
    assert.ok(pipe.gapY - pipe.gap / 2 >= CONFIG.pipeMargin - 1);
    assert.ok(pipe.gapY + pipe.gap / 2 <= CONFIG.height - CONFIG.pipeMargin + 1);
  }
});
