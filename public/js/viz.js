import { INK, MONO, fitCanvas } from "./render.js";

const clamp01 = (value) => Math.max(0, Math.min(1, value));

function prepare(canvas) {
  const { ratio, width, height } = fitCanvas(canvas);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

// Columns come from each node's longest path from the inputs, so a hidden node
// that feeds another hidden node sits to its left. Within a column, nodes are
// ordered by the mean height of their inputs to keep crossings down.
export function layoutNetwork(genome) {
  const nodes = [...genome.nodes.values()];
  const enabled = [...genome.connections.values()].filter((gene) => gene.enabled);
  const incoming = new Map(nodes.map((node) => [node.id, []]));
  for (const gene of enabled) incoming.get(gene.to)?.push(gene.from);

  const depth = new Map();
  const depthOf = (id, trail = new Set()) => {
    if (depth.has(id)) return depth.get(id);
    const node = genome.nodes.get(id);
    if (node.type === "input") return depth.set(id, 0).get(id);
    if (trail.has(id)) return 1;
    trail.add(id);
    const parents = incoming.get(id).filter((from) => genome.nodes.get(from)?.type !== "output");
    const value = Math.max(1, ...parents.map((from) => depthOf(from, trail) + 1));
    trail.delete(id);
    depth.set(id, value);
    return value;
  };
  nodes.filter((node) => node.type === "hidden").forEach((node) => depthOf(node.id));
  const hiddenDepths = nodes.filter((node) => node.type === "hidden").map((node) => depth.get(node.id));
  const outputDepth = Math.max(1, ...hiddenDepths.map((d) => d + 1));
  nodes.filter((node) => node.type === "output").forEach((node) => depth.set(node.id, outputDepth));
  nodes.filter((node) => node.type === "input").forEach((node) => depth.set(node.id, 0));

  const columns = new Map();
  for (const node of nodes) {
    const d = depth.get(node.id);
    if (!columns.has(d)) columns.set(d, []);
    columns.get(d).push(node.id);
  }
  const position = new Map();
  for (const d of [...columns.keys()].sort((a, b) => a - b)) {
    const ids = columns.get(d);
    if (d > 0) {
      const weight = (id) => {
        const ys = incoming.get(id).map((from) => position.get(from)?.y).filter((y) => y !== undefined);
        return ys.length ? ys.reduce((sum, y) => sum + y, 0) / ys.length : 0.5;
      };
      ids.sort((a, b) => weight(a) - weight(b) || a - b);
    } else {
      ids.sort((a, b) => a - b);
    }
    ids.forEach((id, i) => {
      let y = ids.length === 1 ? 0.5 : i / (ids.length - 1);
      // A lone hidden node sits level with the nodes that feed it, so chains
      // of hidden nodes do not collapse onto one horizontal line.
      if (ids.length === 1 && d > 0 && d < outputDepth) {
        const ys = incoming.get(id).map((from) => position.get(from)?.y).filter((value) => value !== undefined);
        if (ys.length) y = 0.12 + 0.76 * (ys.reduce((sum, value) => sum + value, 0) / ys.length);
        y += ((d % 2) - 0.5) * 0.16;
      }
      position.set(id, { x: d / outputDepth, y });
    });
  }
  return {
    nodes: nodes.map((node) => ({ ...node, ...position.get(node.id) })),
    connections: enabled.map((gene) => ({ ...gene })),
    position,
  };
}

export function drawNetwork(canvas, layout, network, inputLabels, flapping) {
  const { ctx, width, height } = prepare(canvas);
  if (!layout) return;
  const left = 64;
  const right = width - 52;
  const top = 18;
  const bottom = height - 18;
  const at = (id) => {
    const p = layout.position.get(id);
    return { x: left + p.x * (right - left), y: top + p.y * (bottom - top) };
  };

  // Edge brightness tracks the signal it is carrying right now; width tracks
  // the weight. Negative weights are dashed.
  for (const gene of layout.connections) {
    const from = at(gene.from);
    const to = at(gene.to);
    const magnitude = clamp01(Math.abs(gene.weight) / 4);
    const signal = clamp01(Math.abs(network.valueOf(gene.from) * gene.weight) / 2);
    ctx.strokeStyle = INK.line;
    ctx.globalAlpha = 0.1 + 0.75 * signal;
    ctx.lineWidth = 0.5 + 1.75 * magnitude;
    ctx.setLineDash(gene.weight < 0 ? [3, 3] : []);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.font = `400 10px ${MONO}`;
  ctx.textBaseline = "middle";
  for (const node of layout.nodes) {
    const { x, y } = at(node.id);
    const value = network.valueOf(node.id);
    const size = node.type === "hidden" ? 7 : 9;
    ctx.fillStyle = INK.bg;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    if (node.type === "output") {
      ctx.fillStyle = flapping ? INK.accent : INK.faint;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
      ctx.strokeStyle = flapping ? INK.accent : INK.dim;
    } else {
      ctx.fillStyle = INK.line;
      ctx.globalAlpha = clamp01(Math.abs(value));
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = INK.dim;
    }
    ctx.lineWidth = 1;
    ctx.strokeRect(x - size / 2 + 0.5, y - size / 2 + 0.5, size - 1, size - 1);
    if (node.type === "input") {
      ctx.fillStyle = INK.dim;
      ctx.textAlign = "right";
      ctx.fillText(inputLabels[node.id] ?? `in${node.id}`, x - 10, y);
    } else if (node.type === "output") {
      ctx.fillStyle = flapping ? INK.accent : INK.dim;
      ctx.textAlign = "left";
      ctx.fillText("FLAP", x + 10, y);
    }
  }
}

// Bars are the best score of each generation; the line is the population mean.
export function drawHistory(canvas, history, maxScore) {
  const { ctx, width, height } = prepare(canvas);
  const top = 16;
  const base = height - 16;
  const shown = history.slice(-Math.max(12, Math.floor(width / 6)));
  const ceiling = Math.max(10, ...shown.map((entry) => entry.best));

  ctx.strokeStyle = INK.faint;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, base + 0.5);
  ctx.lineTo(width, base + 0.5);
  ctx.stroke();

  ctx.font = `400 10px ${MONO}`;
  ctx.fillStyle = INK.dim;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(shown.length ? `G${shown[0].generation}` : "NO GENERATIONS YET", 0, base + 4);
  if (shown.length > 1) {
    ctx.textAlign = "right";
    ctx.fillText(`G${shown[shown.length - 1].generation}`, width, base + 4);
  }
  if (!shown.length) return;

  const slot = width / Math.max(shown.length, 12);
  const barWidth = Math.max(1, slot - 2);
  shown.forEach((entry, i) => {
    const h = Math.max(1, (entry.best / ceiling) * (base - top));
    ctx.fillStyle = entry.best >= maxScore ? INK.accent : i === shown.length - 1 ? INK.line : INK.dim;
    ctx.globalAlpha = entry.best >= maxScore || i === shown.length - 1 ? 1 : 0.55;
    ctx.fillRect(i * slot + 1, base - h, barWidth, h);
  });
  ctx.globalAlpha = 1;

  ctx.strokeStyle = INK.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  shown.forEach((entry, i) => {
    const x = i * slot + slot / 2;
    const y = base - (entry.mean / ceiling) * (base - top);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = INK.dim;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(`MAX ${ceiling}`, width, 0);
}

// One segment per species, sized by member count. The leader's species is lit.
export function drawSpecies(canvas, species, leaderSpeciesId) {
  const { ctx, width, height } = prepare(canvas);
  const total = species.reduce((sum, s) => sum + s.members.length, 0) || 1;
  const gap = 2;
  const usable = width - gap * Math.max(0, species.length - 1);
  let x = 0;
  for (const s of [...species].sort((a, b) => b.members.length - a.members.length)) {
    const w = Math.max(1, (s.members.length / total) * usable);
    ctx.fillStyle = s.id === leaderSpeciesId ? INK.accent : INK.line;
    ctx.globalAlpha = s.id === leaderSpeciesId ? 1 : 0.22 + 0.5 * (s.members.length / total);
    ctx.fillRect(x, 0, w, height);
    x += w + gap;
  }
  ctx.globalAlpha = 1;
}
