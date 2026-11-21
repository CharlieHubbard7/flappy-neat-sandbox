// Draws the playfield. The simulation runs in fixed steps, and the renderer
// blends between the last two so motion is smooth at any refresh rate.

export const INK = {
  bg: "#0a0a0a",
  fg: "#ededed",
  dim: "#8a8a8a",
  faint: "#444444",
  line: "#2a2a2a",
  accent: "#c8ff2e",
};

export const FONT = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

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
  const px = 1 / scale; // one device pixel in world units

  ctx.fillStyle = INK.bg;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.lineWidth = px;
  for (const pipe of world.pipes) {
    const x = lerp(pipe.prevX, pipe.x, alpha);
    if (x > c.width || x + c.pipeWidth < 0) continue;
    const top = pipe.gapY - pipe.gap / 2;
    const bottom = pipe.gapY + pipe.gap / 2;
    ctx.strokeStyle = pipe.cleared ? INK.line : INK.dim;
    ctx.strokeRect(x + px / 2, -1, c.pipeWidth - px, top + 1 - px / 2);
    ctx.strokeRect(x + px / 2, bottom + px / 2, c.pipeWidth - px, c.height - bottom + 1);
  }

  if (view.follow !== undefined) drawSightline(ctx, world, alpha, view.follow, px);

  for (const entry of view.birds) {
    const bird = world.birds[entry.index];
    if (!bird.alive && !entry.showDead) continue;
    drawBird(ctx, c, lerp(bird.prevY, bird.y, alpha), lerp(bird.prevVy, bird.vy, alpha), entry.style, px, bird.alive);
  }

  if (view.score !== undefined) {
    ctx.fillStyle = INK.fg;
    ctx.font = `48px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(String(view.score), c.width / 2, 40);
  }

  if (view.flash > 0) {
    ctx.fillStyle = INK.fg;
    ctx.globalAlpha = view.flash * 0.35;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalAlpha = 1;
  }

  if (view.message) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `16px ${FONT}`;
    view.message.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? INK.fg : INK.dim;
      ctx.fillText(line, c.width / 2, c.height * 0.66 + i * 26);
    });
  }
}

function drawBird(ctx, c, y, vy, style, px, alive) {
  const s = c.birdHalf;
  ctx.save();
  ctx.translate(c.birdX, y);
  ctx.rotate(alive ? Math.max(-0.4, Math.min(0.7, vy / 900)) : 0.7);
  if (style === "player") {
    ctx.fillStyle = alive ? INK.fg : INK.dim;
    ctx.fillRect(-s, -s, 2 * s, 2 * s);
  } else if (style === "leader") {
    ctx.fillStyle = INK.accent;
    ctx.fillRect(-s, -s, 2 * s, 2 * s);
  } else if (style === "ghost") {
    ctx.strokeStyle = INK.accent;
    ctx.lineWidth = 1.5 * px;
    ctx.strokeRect(-s, -s, 2 * s, 2 * s);
  } else {
    ctx.strokeStyle = INK.fg;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = px;
    ctx.strokeRect(-s, -s, 2 * s, 2 * s);
  }
  ctx.restore();
}

// A thin line from the followed bird to the centre of the gap it is aiming for.
function drawSightline(ctx, world, alpha, index, px) {
  const c = world.config;
  const bird = world.birds[index];
  if (!bird?.alive) return;
  const [next] = world.upcoming();
  ctx.strokeStyle = INK.accent;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = px;
  ctx.beginPath();
  ctx.moveTo(c.birdX, lerp(bird.prevY, bird.y, alpha));
  ctx.lineTo(lerp(next.prevX, next.x, alpha) + c.pipeWidth / 2, next.gapY);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
