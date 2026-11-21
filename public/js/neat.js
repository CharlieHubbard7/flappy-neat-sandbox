import { createRng } from "./rng.js";

// A compact NEAT (Stanley & Miikkulainen, 2002): genomes with historical
// innovation numbers, structural mutation, aligned crossover, speciation by
// compatibility distance, explicit fitness sharing and stagnation.

export const DEFAULTS = Object.freeze({
  inputs: 4,
  outputs: 1,
  populationSize: 50,
  weightMutateRate: 0.8,
  weightPower: 0.5,
  weightReplaceRate: 0.1,
  weightLimit: 8,
  biasMutateRate: 0.6,
  addConnectionRate: 0.15,
  addNodeRate: 0.06,
  toggleRate: 0.01,
  disjointCoefficient: 1,
  weightCoefficient: 0.5,
  compatibilityThreshold: 1.6,
  targetSpecies: 6,
  thresholdStep: 0.1,
  thresholdMin: 0.3,
  stagnationLimit: 15,
  protectedSpecies: 2,
  speciesEliteSize: 5,
  survivalRate: 0.3,
  crossoverRate: 0.7,
  inheritDisabledRate: 0.75,
});

const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
export const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// Innovation numbers are shared by the whole run: the same structural change
// gets the same number in every genome, which is what lets crossover and the
// distance measure line genes up.
class Innovations {
  constructor(firstHidden) {
    this.nextInnovation = 0;
    this.nextNode = firstHidden;
    this.connections = new Map();
    this.splits = new Map();
  }

  connection(from, to) {
    const key = `${from}>${to}`;
    if (!this.connections.has(key)) this.connections.set(key, this.nextInnovation++);
    return this.connections.get(key);
  }

  split(innovation) {
    if (!this.splits.has(innovation)) this.splits.set(innovation, this.nextNode++);
    return this.splits.get(innovation);
  }

  freshNode() {
    return this.nextNode++;
  }
}

export class Genome {
  constructor(id) {
    this.id = id;
    this.nodes = new Map(); // id -> { id, type: "input" | "hidden" | "output", bias }
    this.connections = new Map(); // innovation -> { innovation, from, to, weight, enabled }
    this.fitness = 0;
    this.speciesId = null;
  }

  copy(id = this.id) {
    const genome = new Genome(id);
    for (const node of this.nodes.values()) genome.nodes.set(node.id, { ...node });
    for (const gene of this.connections.values()) genome.connections.set(gene.innovation, { ...gene });
    return genome;
  }

  get hiddenCount() {
    let count = 0;
    for (const node of this.nodes.values()) if (node.type === "hidden") count += 1;
    return count;
  }

  get enabledCount() {
    let count = 0;
    for (const gene of this.connections.values()) if (gene.enabled) count += 1;
    return count;
  }

  toJSON() {
    return {
      id: this.id,
      nodes: [...this.nodes.values()],
      connections: [...this.connections.values()],
    };
  }

  static fromJSON(data) {
    const genome = new Genome(data.id);
    for (const node of data.nodes) genome.nodes.set(node.id, { ...node });
    for (const gene of data.connections) genome.connections.set(gene.innovation, { ...gene });
    return genome;
  }
}

// Order nodes so every connection points forward. Disabled genes are kept in
// the graph too, which guarantees that re-enabling one can never form a cycle.
export function topologicalOrder(genome, includeDisabled = false) {
  const incoming = new Map();
  const outgoing = new Map();
  for (const id of genome.nodes.keys()) {
    incoming.set(id, 0);
    outgoing.set(id, []);
  }
  for (const gene of genome.connections.values()) {
    if (!includeDisabled && !gene.enabled) continue;
    if (!incoming.has(gene.from) || !incoming.has(gene.to)) continue;
    incoming.set(gene.to, incoming.get(gene.to) + 1);
    outgoing.get(gene.from).push(gene.to);
  }
  const queue = [...genome.nodes.keys()].filter((id) => incoming.get(id) === 0).sort((a, b) => a - b);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const to of outgoing.get(id)) {
      incoming.set(to, incoming.get(to) - 1);
      if (incoming.get(to) === 0) queue.push(to);
    }
  }
  return order;
}

function reaches(genome, start, target) {
  const stack = [start];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const gene of genome.connections.values()) if (gene.from === id) stack.push(gene.to);
  }
  return false;
}

// Feed-forward evaluator compiled into flat arrays: activation runs once per
// bird per physics step, so it has to be cheap.
export class Network {
  constructor(genome) {
    const order = topologicalOrder(genome);
    this.index = new Map(order.map((id, i) => [id, i]));
    this.values = new Float64Array(order.length);
    this.inputIndices = [];
    this.outputIndices = [];
    const incoming = new Map(order.map((id) => [id, []]));
    for (const gene of genome.connections.values()) {
      if (gene.enabled && incoming.has(gene.to) && this.index.has(gene.from)) incoming.get(gene.to).push(gene);
    }
    this.plan = [];
    for (const id of order) {
      const node = genome.nodes.get(id);
      if (node.type === "input") {
        this.inputIndices[id] = this.index.get(id);
        continue;
      }
      const genes = incoming.get(id);
      this.plan.push({
        target: this.index.get(id),
        bias: node.bias,
        output: node.type === "output",
        sources: Int32Array.from(genes, (gene) => this.index.get(gene.from)),
        weights: Float64Array.from(genes, (gene) => gene.weight),
      });
      if (node.type === "output") this.outputIndices.push(this.index.get(id));
    }
  }

  activate(inputs) {
    const values = this.values;
    for (let i = 0; i < inputs.length; i += 1) values[this.inputIndices[i]] = inputs[i];
    for (const step of this.plan) {
      let sum = step.bias;
      for (let k = 0; k < step.sources.length; k += 1) sum += values[step.sources[k]] * step.weights[k];
      values[step.target] = step.output ? sigmoid(sum) : Math.tanh(sum);
    }
    return values[this.outputIndices[0]];
  }

  valueOf(nodeId) {
    const i = this.index.get(nodeId);
    return i === undefined ? 0 : this.values[i];
  }
}

export class Population {
  constructor(options = {}, seed = 1) {
    this.options = { ...DEFAULTS, ...options };
    this.rng = createRng(seed);
    const { inputs, outputs, populationSize } = this.options;
    this.innovations = new Innovations(inputs + outputs);
    this.threshold = this.options.compatibilityThreshold;
    this.generation = 0;
    this.nextGenomeId = 0;
    this.nextSpeciesId = 0;
    this.species = [];
    this.genomes = Array.from({ length: populationSize }, () => this._initialGenome());
    this.speciate();
  }

  _initialGenome() {
    const { inputs, outputs } = this.options;
    const genome = new Genome(this.nextGenomeId++);
    for (let i = 0; i < inputs; i += 1) genome.nodes.set(i, { id: i, type: "input", bias: 0 });
    for (let o = 0; o < outputs; o += 1) {
      const id = inputs + o;
      genome.nodes.set(id, { id, type: "output", bias: this.rng.gauss() * 0.5 });
      for (let i = 0; i < inputs; i += 1) {
        const innovation = this.innovations.connection(i, id);
        genome.connections.set(innovation, { innovation, from: i, to: id, weight: this.rng.gauss(), enabled: true });
      }
    }
    return genome;
  }

  distance(a, b) {
    let disjoint = 0;
    let matching = 0;
    let weightDifference = 0;
    for (const [innovation, gene] of a.connections) {
      const other = b.connections.get(innovation);
      if (other) {
        matching += 1;
        weightDifference += Math.abs(gene.weight - other.weight);
      } else {
        disjoint += 1;
      }
    }
    for (const innovation of b.connections.keys()) if (!a.connections.has(innovation)) disjoint += 1;
    const size = Math.max(a.connections.size, b.connections.size);
    const normalizer = size < 20 ? 1 : size;
    const { disjointCoefficient, weightCoefficient } = this.options;
    return (disjointCoefficient * disjoint) / normalizer + weightCoefficient * (matching ? weightDifference / matching : 0);
  }

  speciate() {
    for (const species of this.species) species.members = [];
    for (const genome of this.genomes) {
      let home = this.species.find((species) => this.distance(genome, species.representative) < this.threshold);
      if (!home) {
        home = {
          id: this.nextSpeciesId++,
          representative: genome,
          members: [],
          bestFitness: -Infinity,
          lastImproved: this.generation,
          born: this.generation,
        };
        this.species.push(home);
      }
      home.members.push(genome);
      genome.speciesId = home.id;
    }
    this.species = this.species.filter((species) => species.members.length > 0);
    for (const species of this.species) species.representative = this.rng.pick(species.members);

    // Nudge the threshold so the number of species hovers around a target,
    // which is steadier than asking people to pick a raw distance.
    // The step grows with the error (up to 4x) so large populations settle fast.
    const { targetSpecies, thresholdStep, thresholdMin } = this.options;
    const error = this.species.length - targetSpecies;
    const step = thresholdStep * Math.min(4, Math.abs(error));
    this.threshold = Math.max(thresholdMin, this.threshold + Math.sign(error) * step);
  }

  // Call after every genome has a fitness. Produces the next generation.
  evolve() {
    const o = this.options;
    const fitness = (genome) => Math.max(1e-6, genome.fitness);

    for (const species of this.species) {
      species.members.sort((a, b) => b.fitness - a.fitness);
      const top = species.members[0].fitness;
      if (top > species.bestFitness) {
        species.bestFitness = top;
        species.lastImproved = this.generation;
      }
    }

    const champion = this.genomes.reduce((best, genome) => (genome.fitness > best.fitness ? genome : best));
    const ranked = [...this.species].sort((a, b) => b.bestFitness - a.bestFitness);
    const keep = new Set(ranked.slice(0, o.protectedSpecies).map((species) => species.id));
    keep.add(champion.speciesId);
    const living = this.species.filter(
      (species) => keep.has(species.id) || this.generation - species.lastImproved < o.stagnationLimit,
    );

    // Explicit fitness sharing: a species earns offspring in proportion to the
    // mean fitness of its members, so one large species cannot take over.
    const shares = living.map((species) => species.members.reduce((sum, g) => sum + fitness(g), 0) / species.members.length);
    const total = shares.reduce((sum, share) => sum + share, 0);
    const slots = o.populationSize - 1; // one slot is the unchanged champion
    const exact = shares.map((share) => (total > 0 ? (share / total) * slots : slots / living.length));
    const counts = exact.map(Math.floor);
    let remaining = slots - counts.reduce((sum, count) => sum + count, 0);
    const byRemainder = exact.map((value, i) => [value - counts[i], i]).sort((a, b) => b[0] - a[0]);
    for (let k = 0; remaining > 0; k = (k + 1) % byRemainder.length, remaining -= 1) counts[byRemainder[k][1]] += 1;

    const next = [champion.copy(this.nextGenomeId++)];
    living.forEach((species, i) => {
      let count = counts[i];
      const members = species.members;
      if (count > 0 && members.length >= o.speciesEliteSize && members[0] !== champion) {
        next.push(members[0].copy(this.nextGenomeId++));
        count -= 1;
      }
      const parents = members.slice(0, Math.max(1, Math.ceil(members.length * o.survivalRate)));
      for (let k = 0; k < count; k += 1) {
        let child;
        if (parents.length > 1 && this.rng.chance(o.crossoverRate)) {
          const a = this.rng.pick(parents);
          let b = this.rng.pick(parents);
          while (b === a) b = this.rng.pick(parents);
          child = a.fitness >= b.fitness ? this.crossover(a, b) : this.crossover(b, a);
        } else {
          child = this.rng.pick(parents).copy(this.nextGenomeId++);
        }
        this.mutate(child);
        next.push(child);
      }
    });

    this.species = living;
    this.genomes = next;
    this.generation += 1;
    this.speciate();
    return champion;
  }

  // Matching genes come from either parent; disjoint and excess genes come only
  // from the fitter one. The child's connections are a subset of a valid
  // feed-forward genome's, so the child is always acyclic.
  crossover(fitter, other) {
    const child = new Genome(this.nextGenomeId++);
    for (const [innovation, gene] of fitter.connections) {
      const match = other.connections.get(innovation);
      const source = match && this.rng.chance(0.5) ? match : gene;
      const copy = { ...source };
      if (!gene.enabled || (match && !match.enabled)) copy.enabled = !this.rng.chance(this.options.inheritDisabledRate);
      child.connections.set(innovation, copy);
    }
    for (const [id, node] of fitter.nodes) {
      const match = other.nodes.get(id);
      child.nodes.set(id, { ...(match && this.rng.chance(0.5) ? match : node) });
    }
    return child;
  }

  mutate(genome) {
    const o = this.options;
    if (this.rng.chance(o.addNodeRate)) this.addNode(genome);
    if (this.rng.chance(o.addConnectionRate)) this.addConnection(genome);
    for (const gene of genome.connections.values()) {
      if (this.rng.chance(o.weightMutateRate)) {
        gene.weight = this.rng.chance(o.weightReplaceRate)
          ? this.rng.gauss()
          : clamp(gene.weight + this.rng.gauss() * o.weightPower, o.weightLimit);
      }
      if (this.rng.chance(o.toggleRate)) gene.enabled = !gene.enabled;
    }
    for (const node of genome.nodes.values()) {
      if (node.type !== "input" && this.rng.chance(o.biasMutateRate)) {
        node.bias = clamp(node.bias + this.rng.gauss() * o.weightPower, o.weightLimit);
      }
    }
  }

  addConnection(genome) {
    const nodes = [...genome.nodes.values()];
    const sources = nodes.filter((node) => node.type !== "output");
    const targets = nodes.filter((node) => node.type !== "input");
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const from = this.rng.pick(sources).id;
      const to = this.rng.pick(targets).id;
      if (from === to) continue;
      const existing = [...genome.connections.values()].find((gene) => gene.from === from && gene.to === to);
      if (existing) {
        if (!existing.enabled) {
          existing.enabled = true;
          return true;
        }
        continue;
      }
      if (reaches(genome, to, from)) continue;
      const innovation = this.innovations.connection(from, to);
      genome.connections.set(innovation, { innovation, from, to, weight: this.rng.gauss(), enabled: true });
      return true;
    }
    return false;
  }

  addNode(genome) {
    const enabled = [...genome.connections.values()].filter((gene) => gene.enabled);
    if (!enabled.length) return false;
    const gene = this.rng.pick(enabled);
    gene.enabled = false;
    let id = this.innovations.split(gene.innovation);
    if (genome.nodes.has(id)) id = this.innovations.freshNode();
    genome.nodes.set(id, { id, type: "hidden", bias: 0 });
    const into = this.innovations.connection(gene.from, id);
    const out = this.innovations.connection(id, gene.to);
    genome.connections.set(into, { innovation: into, from: gene.from, to: id, weight: 1, enabled: true });
    genome.connections.set(out, { innovation: out, from: id, to: gene.to, weight: gene.weight, enabled: true });
    return true;
  }
}
