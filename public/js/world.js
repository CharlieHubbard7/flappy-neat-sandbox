import { createRng } from "./rng.js";

// One physics model for both modes. Units are pixels and seconds, and the
// simulation always advances in fixed 1/60 s steps so a seed and a sequence
// of flaps always produce the same run.
export const CONFIG = Object.freeze({
  width: 480,
  height: 640,
  dt: 1 / 60,
  birdX: 128,
  birdHalf: 11,
  gravity: 1700,
  flapVelocity: -500,
  maxFall: 720,
  pipeWidth: 60,
  pipeSpacing: 260,
  pipeSpeed: 160,
  pipeMargin: 72,
  firstPipeX: 560,
  // The course tightens over its first `rampPipes` pipes: gaps shrink and
  // consecutive gaps can sit further apart.
  rampPipes: 60,
  gapStart: 176,
  gapEnd: 122,
  shiftStart: 130,
  shiftEnd: 270,
});

export function difficulty(config, pipeNumber) {
  const t = Math.min(1, Math.max(0, (pipeNumber - 1) / config.rampPipes));
  return {
    gap: Math.round(config.gapStart + (config.gapEnd - config.gapStart) * t),
    shift: config.shiftStart + (config.shiftEnd - config.shiftStart) * t,
  };
}

export class World {
  constructor(seed = 1, birdCount = 1, config = CONFIG) {
    this.config = config;
    this.reset(seed, birdCount);
  }

  reset(seed = this.seed, birdCount = this.birds?.length ?? 1) {
    const { height, firstPipeX } = this.config;
    this.seed = seed >>> 0;
    this.rng = createRng(this.seed);
    this.frame = 0;
    this.distance = 0;
    this.prevDistance = 0;
    this.score = 0;
    this.pipes = [];
    this.pipeCount = 0;
    this.aliveCount = birdCount;
    this.birds = Array.from({ length: birdCount }, () => ({
      y: height / 2,
      prevY: height / 2,
      vy: 0,
      prevVy: 0,
      alive: true,
      frames: 0,
      score: 0,
    }));
    this._spawn(firstPipeX);
    this._fill();
  }

  // Pipes ahead of the bird that it still has to clear, nearest first.
  upcoming() {
    const { birdX, birdHalf, pipeWidth } = this.config;
    const index = this.pipes.findIndex((pipe) => pipe.x + pipeWidth > birdX - birdHalf);
    return [this.pipes[index], this.pipes[index + 1]];
  }

  // flaps[i] is truthy when bird i flaps on this step.
  step(flaps) {
    const c = this.config;
    const dt = c.dt;
    this.frame += 1;
    this.prevDistance = this.distance;
    this.distance += c.pipeSpeed * dt;

    for (const pipe of this.pipes) {
      pipe.prevX = pipe.x;
      pipe.x -= c.pipeSpeed * dt;
    }
    while (this.pipes.length && this.pipes[0].x + c.pipeWidth < -c.pipeWidth) this.pipes.shift();
    this._fill();

    // A pipe is cleared once its trailing edge is behind the bird's back edge.
    // Every bird shares birdX, so a pipe is cleared for all survivors at once.
    let cleared = false;
    for (const pipe of this.pipes) {
      if (!pipe.cleared && pipe.x + c.pipeWidth < c.birdX - c.birdHalf) {
        pipe.cleared = true;
        cleared = true;
      }
    }
    if (cleared) this.score += 1;

    for (let i = 0; i < this.birds.length; i += 1) {
      const bird = this.birds[i];
      bird.prevY = bird.y;
      bird.prevVy = bird.vy;
      if (!bird.alive) continue;
      if (flaps && flaps[i]) bird.vy = c.flapVelocity;
      bird.vy = Math.min(c.maxFall, bird.vy + c.gravity * dt);
      bird.y += bird.vy * dt;
      bird.frames += 1;
      if (this._collides(bird.y)) {
        bird.alive = false;
        this.aliveCount -= 1;
      } else if (cleared) {
        bird.score += 1;
      }
    }
  }

  _collides(y) {
    const c = this.config;
    const top = y - c.birdHalf;
    const bottom = y + c.birdHalf;
    if (top <= 0 || bottom >= c.height) return true;
    const left = c.birdX - c.birdHalf;
    const right = c.birdX + c.birdHalf;
    for (const pipe of this.pipes) {
      if (right <= pipe.x || left >= pipe.x + c.pipeWidth) continue;
      if (top < pipe.gapY - pipe.gap / 2 || bottom > pipe.gapY + pipe.gap / 2) return true;
    }
    return false;
  }

  // Keep at least two pipes beyond the right edge, so the lookahead sensor
  // always has a real pipe to read.
  _fill() {
    const c = this.config;
    while (this.pipes[this.pipes.length - 1].x < c.width + c.pipeSpacing) {
      this._spawn(this.pipes[this.pipes.length - 1].x + c.pipeSpacing);
    }
  }

  _spawn(x) {
    const c = this.config;
    this.pipeCount += 1;
    const { gap, shift } = difficulty(c, this.pipeCount);
    const low = c.pipeMargin + gap / 2;
    const high = c.height - c.pipeMargin - gap / 2;
    let gapY = c.height / 2;
    if (this.pipeCount > 1) {
      const previous = this.pipes[this.pipes.length - 1].gapY;
      const min = Math.max(low, previous - shift);
      const max = Math.min(high, previous + shift);
      gapY = Math.round(this.rng.range(min, max));
    }
    this.pipes.push({ id: this.pipeCount, x, prevX: x, gapY, gap, cleared: false });
  }
}
