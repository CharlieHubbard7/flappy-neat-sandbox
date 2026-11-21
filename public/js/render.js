// Canvas drawing for the playfield. Everything is drawn in world units and
// interpolated between the last two physics steps, so motion is smooth on any
// refresh rate without the simulation ever running at a variable step.

export const INK = {
  bg: "#0a0a0a",
  grid: "#1d1d1d",
  pipe: "#111111",
  line: "#ededed",
  dim: "#8c8c8c",
  faint: "#3a3a3a",
  accent: "#c8ff2e",
};

export const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const lerp = (a, b, t) => a + (b - a) * t;

// Keeps a canvas's backing store matched to its CSS size and pixel ratio.
export function fitCanvas(canvas) {
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  const { width, height } = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(width * ratio));
  const h = Math.max(1, Math.round(height * ratio));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { ratio, width, height };
}

export function drawWorld(ctx, world, alpha, view) {
  const c = world.config;
  const scale = ctx.canvas.width / c.width;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const px = 1 / scale; // one device pixel, in world units

  ctx.fillStyle = INK.bg;
  ctx.fillRect(0, 0, c.width, c.height);

  // Dot grid scrolling at half speed gives depth without any decoration.
  const step = 32;
  const offset = (lerp(world.prevDistance, world.distance, alpha) * 0.5) % step;
  ctx.fillStyle = INK.grid;
  for (let x = step - offset; x < c.width; x += step) {
    for (let y = step; y < c.height; y += step) ctx.fillRect(x - px, y - px, 2 * px, 2 * px);
  }

  // Pipes: dark blocks with a hairline edge.
  ctx.lineWidth = px;
  for (const pipe of world.pipes) {
    const x = lerp(pipe.prevX, pipe.x, alpha);
    if (x > c.width || x + c.pipeWidth < 0) continue;
    const top = pipe.gapY - pipe.gap / 2;
    const bottom = pipe.gapY + pipe.gap / 2;
    ctx.fillStyle = INK.pipe;
    ctx.fillRect(x, 0, c.pipeWidth, top);
    ctx.fillRect(x, bottom, c.pipeWidth, c.height - bottom);
    ctx.strokeStyle = pipe.cleared ? INK.faint : INK.line;
    ctx.strokeRect(x + px / 2, -1, c.pipeWidth - px, top + 1 - px / 2);
    ctx.strokeRect(x + px / 2, bottom + px / 2, c.pipeWidth - px, c.height - bottom + 1);
  }

  if (view.sensors !== undefined) drawSensors(ctx, world, alpha, view.sensors, px);

  for (const entry of view.birds) {
    const bird = world.birds[entry.index];
    if (!bird.alive && !entry.showDead) continue;
    const y = lerp(bird.prevY, bird.y, alpha);
    const vy = lerp(bird.prevVy, bird.vy, alpha);
    drawBird(ctx, c, y, vy, entry.style, px, bird.alive);
  }

  if (view.score !== undefined) {
    ctx.fillStyle = INK.line;
    ctx.globalAlpha = 0.92;
    ctx.font = `500 56px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(String(view.score).padStart(2, "0"), c.width / 2, 36);
    ctx.globalAlpha = 1;
  }

  if (view.flash > 0) {
    ctx.fillStyle = INK.line;
    ctx.globalAlpha = view.flash * 0.5;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalAlpha = 1;
  }

  if (view.message) drawMessage(ctx, c, view.message);
}

function drawBird(ctx, c, y, vy, style, px, alive) {
  const s = c.birdHalf;
  ctx.save();
  ctx.translate(c.birdX, y);
  ctx.rotate(alive ? Math.max(-0.4, Math.min(0.7, vy / 900)) : 0.7);
  if (style === "player") {
    ctx.fillStyle = alive ? INK.line : INK.dim;
    ctx.fillRect(-s, -s, 2 * s, 2 * s);
    ctx.fillStyle = INK.bg;
    ctx.fillRect(s * 0.25, -s * 0.55, s * 0.4, s * 0.4); // the single eye
  } else if (style === "leader") {
    ctx.fillStyle = INK.accent;
    ctx.fillRect(-s, -s, 2 * s, 2 * s);
  } else if (style === "ghost") {
    ctx.strokeStyle = INK.accent;
    ctx.lineWidth = 1.5 * px;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(-s, -s, 2 * s, 2 * s);
  } else {
    ctx.strokeStyle = INK.line;
    ctx.globalAlpha = 0.32;
    ctx.lineWidth = px;
    ctx.strokeRect(-s, -s, 2 * s, 2 * s);
  }
  ctx.restore();
}

// The leader's view of the world: a line to the next gap, a dotted line to the
// one after, and tick marks at the gap edges.
function drawSensors(ctx, world, alpha, index, px) {
  const c = world.config;
  const bird = world.birds[index];
  if (!bird?.alive) return;
  const [next, after] = world.upcoming();
  const y = lerp(bird.prevY, bird.y, alpha);
  const nx = lerp(next.prevX, next.x, alpha);
  const ax = lerp(after.prevX, after.x, alpha);
  ctx.save();
  ctx.strokeStyle = INK.accent;
  ctx.lineWidth = px;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(c.birdX, y);
  ctx.lineTo(nx, next.gapY);
  ctx.stroke();
  ctx.setLineDash([2, 4]);
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.moveTo(c.birdX, y);
  ctx.lineTo(ax, after.gapY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.9;
  for (const [x, pipe] of [[nx, next], [ax, after]]) {
    ctx.beginPath();
    ctx.moveTo(x - 6, pipe.gapY);
    ctx.lineTo(x + 6, pipe.gapY);
    ctx.moveTo(x, pipe.gapY - 6);
    ctx.lineTo(x, pipe.gapY + 6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMessage(ctx, c, { title, lines = [] }) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const y = c.height * 0.62;
  const top = y - 40;
  const height = 52 + lines.length * 22;
  ctx.fillStyle = INK.bg;
  ctx.fillRect(0, top, c.width, height);
  ctx.fillStyle = INK.faint;
  ctx.fillRect(0, top, c.width, 1);
  ctx.fillRect(0, top + height - 1, c.width, 1);
  ctx.fillStyle = INK.line;
  ctx.font = `600 15px ${MONO}`;
  ctx.fillText(title, c.width / 2, y - 12);
  ctx.font = `400 12px ${MONO}`;
  lines.forEach((line, i) => {
    ctx.fillStyle = i === lines.length - 1 ? INK.accent : INK.dim;
    ctx.fillText(line, c.width / 2, y + 16 + i * 22);
  });
  ctx.restore();
}
