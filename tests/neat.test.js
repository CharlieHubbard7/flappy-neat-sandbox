import assert from "node:assert/strict";
import { test } from "node:test";

import { Genome, Network, Population, topologicalOrder } from "../public/js/neat.js";

const hasCycle = (genome) => topologicalOrder(genome, true).length !== genome.nodes.size;

test("initial genomes connect every input straight to the output", () => {
  const population = new Population({ populationSize: 10 }, 1);
  assert.equal(population.genomes.length, 10);
  for (const genome of population.genomes) {
    assert.equal(genome.nodes.size, 5);
    assert.equal(genome.connections.size, 4);
  }
  // Same structure, so every genome shares the same innovation numbers.
  const keys = population.genomes.map((g) => [...g.connections.keys()].join());
  assert.equal(new Set(keys).size, 1);
});

test("the network evaluates a hand-built genome correctly", () => {
  const genome = new Genome(0);
  genome.nodes.set(0, { id: 0, type: "input", bias: 0 });
  genome.nodes.set(1, { id: 1, type: "output", bias: 0.5 });
  genome.nodes.set(2, { id: 2, type: "hidden", bias: 0 });
  genome.connections.set(0, { innovation: 0, from: 0, to: 2, weight: 2, enabled: true });
  genome.connections.set(1, { innovation: 1, from: 2, to: 1, weight: -1, enabled: true });
  genome.connections.set(2, { innovation: 2, from: 0, to: 1, weight: 9, enabled: false });
  const output = new Network(genome).activate([0.3]);
  const expected = 1 / (1 + Math.exp(-(0.5 - Math.tanh(0.6))));
  assert.ok(Math.abs(output - expected) < 1e-12);
});

test("structural mutation never creates a cycle", () => {
  const population = new Population({ populationSize: 30, addConnectionRate: 0.9, addNodeRate: 0.5 }, 7);
  for (let generation = 0; generation < 40; generation += 1) {
    for (const genome of population.genomes) {
      genome.fitness = genome.connections.size + Math.random();
      assert.equal(hasCycle(genome), false);
      assert.doesNotThrow(() => new Network(genome).activate([0.1, -0.2, 0.3, 0.4]));
    }
    population.evolve();
  }
  assert.ok(population.genomes.some((genome) => genome.hiddenCount > 0));
});

test("evolve keeps the population size exact and carries the champion over", () => {
  const population = new Population({ populationSize: 37 }, 3);
  for (let generation = 0; generation < 10; generation += 1) {
    population.genomes.forEach((genome, i) => {
      genome.fitness = i;
    });
    const champion = population.genomes.at(-1);
    population.evolve();
    assert.equal(population.genomes.length, 37);
    assert.deepEqual(population.genomes[0].toJSON().connections, champion.toJSON().connections);
  }
});

test("the same structural change gets the same innovation number", () => {
  const population = new Population({ populationSize: 2 }, 5);
  const [a, b] = population.genomes;
  const gene = [...a.connections.values()][0];
  const twin = b.connections.get(gene.innovation);
  // Force both genomes to split the same connection.
  population.rng.pick = (list) => list.find((item) => item.innovation === gene.innovation) ?? list[0];
  population.addNode(a);
  population.addNode(b);
  assert.equal(twin.enabled, false);
  assert.deepEqual([...a.connections.keys()].sort(), [...b.connections.keys()].sort());
  assert.deepEqual([...a.nodes.keys()].sort(), [...b.nodes.keys()].sort());
});

test("speciation follows the target species count", () => {
  const population = new Population({ populationSize: 100, targetSpecies: 5, addConnectionRate: 0.5, addNodeRate: 0.3 }, 2);
  const counts = [];
  for (let generation = 0; generation < 30; generation += 1) {
    population.genomes.forEach((genome) => {
      genome.fitness = 1 + Math.random();
    });
    population.evolve();
    counts.push(population.species.length);
  }
  const recent = counts.slice(-10);
  const mean = recent.reduce((sum, count) => sum + count, 0) / recent.length;
  assert.ok(mean > 2 && mean < 12, `mean species ${mean} from ${counts}`);
});

test("genomes survive a JSON round trip", () => {
  const population = new Population({ populationSize: 5, addNodeRate: 1 }, 4);
  const genome = population.genomes[1];
  population.addNode(genome);
  const copy = Genome.fromJSON(JSON.parse(JSON.stringify(genome)));
  const inputs = [0.2, -0.4, 0.9, 0.1];
  assert.equal(new Network(copy).activate(inputs), new Network(genome).activate(inputs));
});
