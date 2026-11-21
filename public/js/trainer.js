import { Genome, Network, Population } from "./neat.js";
import { mixSeed } from "./rng.js";
import { CONFIG, World } from "./world.js";

export const INPUT_LABELS = ["GAP Δy", "VEL", "PIPE Δx", "NEXT Δy"];

export const PRESETS = {
  mutation: {
    low: { addConnectionRate: 0.08, addNodeRate: 0.03, weightPower: 0.3 },
    mid: { addConnectionRate: 0.15, addNodeRate: 0.06, weightPower: 0.5 },
    high: { addConnectionRate: 0.3, addNodeRate: 0.12, weightPower: 0.8 },
  },
  species: {
    few: { targetSpecies: 3 },
    mid: { targetSpecies: 6 },
    many: { targetSpecies: 10 },
  },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// The four numbers a bird sees. All are scaled to roughly [-1, 1].
export function sense(world, bird, out, ahead = world.upcoming()) {
  const c = world.config;
  const [next, after] = ahead;
  const half = c.height / 2;
  out[0] = clamp((next.gapY - bird.y) / half, -1, 1);
  out[1] = clamp(bird.vy / c.maxFall, -1, 1);
  out[2] = clamp((next.x + c.pipeWidth - c.birdX) / c.pipeSpacing, 0, 1.5);
  out[3] = clamp((after.gapY - bird.y) / half, -1, 1);
  return out;
}

// Seconds survived, plus a bonus per pipe, plus up to one point for dying
// close to the gap. The last term separates birds that crash at the same pipe.
export function fitnessOf(world, bird) {
  const [next] = world.upcoming();
  const miss = Math.min(1, Math.abs(next.gapY - bird.y) / (world.config.height / 2));
  return bird.frames * world.config.dt + 2 * bird.score + (1 - miss);
}

export class Trainer {
  constructor({ seed = 1, populationSize = 50, mutation = "mid", species = "mid", course = "varied", maxScore = 100 } = {}) {
    this.seed = seed;
    this.course = course;
    this.maxScore = maxScore;
    this.settings = { populationSize, mutation, species, course };
    this.population = new Population(
      { populationSize, ...PRESETS.mutation[mutation], ...PRESETS.species[species] },
      seed,
    );
    this.history = [];
    this.record = 0;
    this.recordGeneration = null;
    this.champion = null;
    this.steps = 0;
    this.listeners = new Set();
    this._ahead = [null, null];
    this._start();
  }

  get generation() {
    return this.population.generation;
  }

  get leader() {
    return this.agents[this.leaderIndex];
  }

  onGeneration(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  tune({ mutation, species, course } = {}) {
    if (mutation && PRESETS.mutation[mutation]) {
      Object.assign(this.population.options, PRESETS.mutation[mutation]);
      this.settings.mutation = mutation;
    }
    if (species && PRESETS.species[species]) {
      Object.assign(this.population.options, PRESETS.species[species]);
      this.settings.species = species;
    }
    if (course === "fixed" || course === "varied") {
      this.course = course;
      this.settings.course = course;
    }
  }

  courseSeed(generation = this.generation) {
    return this.course === "fixed" ? mixSeed(this.seed, 0) : mixSeed(this.seed, generation + 1);
  }

  _start() {
    const genomes = this.population.genomes;
    this.world = new World(this.courseSeed(), genomes.length, CONFIG);
    this.agents = genomes.map((genome) => ({
      genome,
      network: new Network(genome),
      inputs: new Float64Array(4),
      output: 0,
      fitness: 0,
      done: false,
    }));
    this.flaps = new Uint8Array(genomes.length);
    // Index 0 is last generation's champion, carried over unchanged, so it is
    // the natural bird to follow. The leader only changes when it dies.
    this.leaderIndex = 0;
  }

  step() {
    const world = this.world;
    const ahead = world.upcoming();
    for (let i = 0; i < this.agents.length; i += 1) {
      const bird = world.birds[i];
      if (!bird.alive) continue;
      const agent = this.agents[i];
      sense(world, bird, agent.inputs, ahead);
      agent.output = agent.network.activate(agent.inputs);
      this.flaps[i] = agent.output > 0.5 ? 1 : 0;
    }
    world.step(this.flaps);
    this.steps += 1;

    for (let i = 0; i < this.agents.length; i += 1) {
      const bird = world.birds[i];
      const agent = this.agents[i];
      if (!bird.alive && !agent.done) {
        agent.fitness = fitnessOf(world, bird);
        agent.done = true;
      }
    }

    if (!world.birds[this.leaderIndex].alive) {
      const next = world.birds.findIndex((bird) => bird.alive);
      if (next >= 0) this.leaderIndex = next;
    }

    if (world.aliveCount === 0 || world.score >= this.maxScore) this._finish();
  }

  _finish() {
    const world = this.world;
    for (let i = 0; i < this.agents.length; i += 1) {
      const agent = this.agents[i];
      if (!agent.done) agent.fitness = fitnessOf(world, world.birds[i]);
      agent.genome.fitness = agent.fitness;
    }

    const scores = world.birds.map((bird) => bird.score);
    const fitness = this.agents.map((agent) => agent.fitness);
    const bestIndex = fitness.indexOf(Math.max(...fitness));
    const best = this.agents[bestIndex];
    const species = this.population.species.length;
    const entry = {
      generation: this.generation,
      best: Math.max(...scores),
      mean: scores.reduce((sum, score) => sum + score, 0) / scores.length,
      bestFitness: best.fitness,
      meanFitness: fitness.reduce((sum, value) => sum + value, 0) / fitness.length,
      cleared: scores.filter((score) => score >= 1).length,
      species,
      nodes: best.genome.hiddenCount,
      connections: best.genome.enabledCount,
      solved: world.score >= this.maxScore,
    };
    this.history.push(entry);
    if (this.history.length > 240) this.history.shift();

    if (entry.best >= this.record) {
      this.record = entry.best;
      this.recordGeneration = entry.generation;
      this.champion = {
        generation: entry.generation,
        score: entry.best,
        genome: best.genome.toJSON(),
      };
    }

    this.population.evolve();
    this._start();
    for (const listener of this.listeners) listener(entry, this);
  }
}

// A saved champion flies the play-mode ghost.
export function championNetwork(champion) {
  return champion ? new Network(Genome.fromJSON(champion.genome)) : null;
}
