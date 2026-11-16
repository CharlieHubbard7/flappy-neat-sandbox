import { drawBird, drawPipe, drawSky } from "/drawing.js";

const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const metricOne = document.querySelector("#metric-one-value");
const metricTwo = document.querySelector("#metric-two-value");

const config = { width: 480, height: 640, birdX: 130, radius: 14, gravity: 1100, flap: -360, pipeWidth: 76, pipeGap: 165, pipeSpeed: 175, pipeInterval: 1.55 };
let best = Number(localStorage.getItem("ai-flappy-best") || 0);
let game;
let previous = performance.now();
let accumulated = 0;

function reset() {
  game = { birdY: config.height / 2, velocity: 0, pipes: [], score: 0, alive: true, waiting: true, sincePipe: config.pipeInterval - .65, seed: 7, pipeNumber: 0 };
  render();
}

function random() {
  game.seed = (game.seed * 1664525 + 1013904223) >>> 0;
  return game.seed / 4294967296;
}

function flap() {
  if (!game.alive) reset();
  game.waiting = false;
  game.velocity = config.flap;
}

function step() {
  if (!game.alive || game.waiting) return;
  game.velocity += config.gravity / 60;
  game.birdY += game.velocity / 60;
  game.sincePipe += 1 / 60;
  while (game.sincePipe >= config.pipeInterval) {
    game.sincePipe -= config.pipeInterval;
    game.pipeNumber += 1;
    const center = config.height / 2;
    const gapY = game.pipeNumber === 1 ? center : 183 + random() * 274;
    game.pipes.push({ x: config.width + 20, gapY, counted: false });
  }
  for (const pipe of game.pipes) {
    pipe.x -= config.pipeSpeed / 60;
    if (!pipe.counted && pipe.x + config.pipeWidth < config.birdX) {
      pipe.counted = true;
      game.score += 1;
      if (game.score > best) {
        best = game.score;
        localStorage.setItem("ai-flappy-best", String(best));
      }
    }
  }
  game.pipes = game.pipes.filter((pipe) => pipe.x + config.pipeWidth > -20);
  const edgeHit = game.birdY - config.radius <= 0 || game.birdY + config.radius >= config.height;
  const pipeHit = game.pipes.some((pipe) => {
    const overlaps = config.birdX + config.radius > pipe.x && config.birdX - config.radius < pipe.x + config.pipeWidth;
    const outside = game.birdY - config.radius < pipe.gapY - config.pipeGap / 2 || game.birdY + config.radius > pipe.gapY + config.pipeGap / 2;
    return overlaps && outside;
  });
  game.alive = !edgeHit && !pipeHit;
}

function render() {
  drawSky(context, canvas);
  game.pipes.forEach((pipe) => drawPipe(context, canvas, pipe));
  drawBird(context, config.birdX, game.birdY, game.velocity);
  metricOne.textContent = game.score;
  metricTwo.textContent = best;
}

function tick(now) {
  const elapsed = Math.min(.1, (now - previous) / 1000);
  previous = now;
  if (document.body.dataset.mode === "human") {
    accumulated += elapsed;
    while (accumulated >= 1 / 60) { step(); accumulated -= 1 / 60; }
    render();
  }
  requestAnimationFrame(tick);
}

function onFlap(event) {
  if (document.body.dataset.mode !== "human") return;
  event?.preventDefault();
  flap();
}

canvas.addEventListener("pointerdown", onFlap);
window.addEventListener("keydown", (event) => { if (event.code === "Space") onFlap(event); });
window.addEventListener("sandboxmode", ({ detail }) => { if (detail === "human") { previous = performance.now(); render(); } });

reset();
requestAnimationFrame(tick);
