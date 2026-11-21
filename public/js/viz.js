import { FONT, INK, fitCanvas } from "./render.js";

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
  const enabled = [...genome.connections.values()].filter((gene) => gene.enabled);
  // Hidden nodes whose links are all switched off do nothing, so skip them.
  const linked = new Set(enabled.flatMap((gene) => [gene.from, gene.to]));
  const nodes = [...genome.nodes.values()].filter((node) => node.type !== "hidden" || linked.has(node.id));
  const incoming = new Map(nodes.map((node) => [node.id, []]));
  for (const gene of enabled) incoming.get(gene.to)?.push(gene.from);

  const depth = new Map();
  const depthOf = (id) => {
    if (depth.has(id)) return depth.get(id);
    const node = genome.nodes.get(id);
    if (node.type === "input") return 0;
    const parents = incoming.get(id);
    const value = Math.max(1, ...parents.map((from) => depthOf(from) + 1));
    depth.set(id, value);
    return value;
  };
  const hidden = nodes.filter((node) => node.type === "hidden");
  hidden.forEach((node) => depthOf(node.id));
  const outputDepth = Math.max(1, ...hidden.map((node) => depth.get(node.id) + 1));
  for (const node of nodes) {
    if (node.type === "input") depth.set(node.id, 0);
    if (node.type === "output") depth.set(node.id, outputDepth);
  }

  const columns = new Map();
  for (const node of nodes) {
    const d = depth.get(node.id);
    if (!columns.has(d)) columns.set(d, []);
    columns.get(d).push(node.id);
  }
  const position = new Map();
  const meanInputY = (id) => {
    const ys = incoming.get(id).map((from) => position.get(from)?.y).filter((y) => y !== undefined);
    return ys.length ? ys.reduce((sum, y) => sum + y, 0) / ys.length : 0.5;
  };
  for (const d of [...columns.keys()].sort((a, b) => a - b)) {
    const ids = columns.get(d);
    if (d > 0) ids.sort((a, b) => meanInputY(a) - meanInputY(b) || a - b);
    else ids.sort((a, b) => a - b);
    ids.forEach((id, i) => {
      let y = ids.length === 1 ? 0.5 : i / (ids.length - 1);
      // A lone hidden node sits level with whatever feeds it, so a chain of
      // hidden nodes doesn't collapse onto one horizontal line.
      if (ids.length === 1 && d > 0 && d < outputDepth) y = 0.15 + 0.7 * meanInputY(id);
      position.set(id, { x: d / outputDepth, y });
    });
  }
  return { nodes, connections: enabled, position };
}

export function drawNetwork(canvas, layout, network, inputLabels, flapping) {
  const { ctx, width, height } = prepare(canvas);
  if (!layout) return;
  const left = 62;
  const right = width - 36;
  const top = 10;
  const bottom = height - 10;
  const at = (id) => {
    const p = layout.position.get(id);
    return { x: left + p.x * (right - left), y: top + p.y * (bottom - top) };
  };

  // Line width is the weight, brightness is the signal it carries right now,
  // and negative weights are dashed.
  for (const gene of layout.connections) {
    const from = at(gene.from);
    const to = at(gene.to);
    ctx.strokeStyle = INK.fg;
    ctx.globalAlpha = 0.12 + 0.7 * clamp01(Math.abs(network.valueOf(gene.from) * gene.weight) / 2);
    ctx.lineWidth = 0.5 + 1.5 * clamp01(Math.abs(gene.weight) / 4);
    ctx.setLineDash(gene.weight < 0 ? [3, 3] : []);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.font = `12px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.lineWidth = 1;
  for (const node of layout.nodes) {
    const { x, y } = at(node.id);
    const r = node.type === "hidden" ? 3 : 4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (node.type === "output") {
      ctx.fillStyle = flapping ? INK.accent : INK.bg;
      ctx.strokeStyle = flapping ? INK.accent : INK.dim;
    } else {
      const v = clamp01(Math.abs(network.valueOf(node.id)));
      ctx.fillStyle = `rgba(237, 237, 237, ${v})`;
      ctx.strokeStyle = INK.dim;
    }
    ctx.fill();
    ctx.stroke();
    if (node.type === "input") {
      ctx.fillStyle = INK.dim;
      ctx.textAlign = "right";
      ctx.fillText(inputLabels[node.id] ?? "", x - 10, y);
    } else if (node.type === "output") {
      ctx.fillStyle = flapping ? INK.accent : INK.dim;
      ctx.textAlign = "left";
      ctx.fillText("flap", x + 9, y);
    }
  }
}

// One bar per generation, the latest in white.
export function drawHistory(canvas, history) {
  const { ctx, width, height } = prepare(canvas);
  const shown = history.slice(-Math.max(20, Math.floor(width / 5)));
  const ceiling = Math.max(10, ...shown.map((entry) => entry.best));
  ctx.fillStyle = INK.line;
  ctx.fillRect(0, height - 1, width, 1);
  if (!shown.length) return;
  const slot = width / Math.max(shown.length, 20);
  shown.forEach((entry, i) => {
    const h = Math.max(1, (entry.best / ceiling) * (height - 2));
    ctx.fillStyle = i === shown.length - 1 ? INK.fg : INK.faint;
    ctx.fillRect(i * slot, height - 1 - h, Math.max(1, slot - 2), h);
  });
}
