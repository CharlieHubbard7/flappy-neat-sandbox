import { CONFIG, World } from "./world.js";
import { INPUT_LABELS, Trainer, championNetwork, sense } from "./trainer.js";
import { drawWorld, fitCanvas } from "./render.js";
import { drawHistory, drawNetwork, layoutNetwork } from "./viz.js";

const $ = (selector) => document.querySelector(selector);
const DT = CONFIG.dt;
const MAX_SCORE = 100;

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`flappy-neat:${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`flappy-neat:${key}`, JSON.stringify(value));
    } catch {
      // Private windows can block storage. Nothing depends on it.
    }
  },
};

// Only touch the DOM when a value actually changes.
const shown = new Map();
function text(element, value) {
  value = String(value);
  if (shown.get(element) !== value) {
    shown.set(element, value);
    element.textContent = value;
  }
}

const canvas = $("#game");
const ctx = canvas.getContext("2d");
const ui = {
  playScore: $("#play-score"),
  playBest: $("#play-best"),
  ghostToggle: $("#ghost-toggle"),
  ghostNote: $("#ghost-note"),
  gen: $("#evo-gen"),
  alive: $("#evo-alive"),
  score: $("#evo-score"),
  record: $("#evo-record"),
  network: $("#network"),
  history: $("#history"),
  pause: $("#pause"),
  reset: $("#reset"),
};

let mode = "play";

// --- play ---------------------------------------------------------------

const play = {
  world: null,
  state: "ready", // ready, running, over
  queuedFlap: false,
  diedAt: 0,
  flash: 0,
  best: Number(store.get("best", 0)) || 0,
  newBest: false,
  ghostOn: Boolean(store.get("ghost", false)),
  champion: store.get("champion", null),
  ghostNet: null,
  ghostInputs: new Float64Array(4),
  acc: 0,
  flaps: [0, 0],
};
play.ghostNet = championNetwork(play.champion);

function resetPlay() {
  const ghost = play.ghostOn && play.ghostNet !== null;
  play.world = new World((Math.random() * 2 ** 32) >>> 0, ghost ? 2 : 1);
  play.state = "ready";
  play.queuedFlap = false;
  play.acc = 0;
  play.newBest = false;
}

function press() {
  if (play.state === "over") {
    if (performance.now() - play.diedAt < 450) return; // ignore panic taps right after a crash
    resetPlay();
  }
  if (play.state === "ready") {
    play.state = "running";
    play.acc = 0;
  }
  play.queuedFlap = true;
}

function stepPlay() {
  const world = play.world;
  play.flaps[0] = play.queuedFlap ? 1 : 0;
  play.queuedFlap = false;
  if (world.birds.length > 1 && world.birds[1].alive) {
    sense(world, world.birds[1], play.ghostInputs);
    play.flaps[1] = play.ghostNet.activate(play.ghostInputs) > 0.5 ? 1 : 0;
  }
  world.step(play.flaps);
  const you = world.birds[0];
  if (!you.alive) {
    play.state = "over";
    play.diedAt = performance.now();
    play.flash = 1;
    if (you.score > play.best) {
      play.best = you.score;
      play.newBest = true;
      store.set("best", play.best);
    }
  }
}

function framePlay(dt, now) {
  const world = play.world;
  let alpha = 1;
  if (play.state === "running") {
    play.acc += dt;
    while (play.acc >= DT && play.state === "running") {
      stepPlay();
      play.acc -= DT;
    }
    alpha = play.state === "running" ? play.acc / DT : 1;
  } else if (play.state === "ready") {
    // Gentle bob while waiting. Not part of the simulation.
    const y = CONFIG.height / 2 + Math.sin(now / 260) * 5;
    for (const bird of world.birds) {
      bird.prevY = bird.y = y;
      bird.vy = bird.prevVy = 0;
    }
  }
  play.flash = Math.max(0, play.flash - dt * 6);

  const you = world.birds[0];
  const ghost = world.birds[1];
  const birds = ghost ? [{ index: 1, style: "ghost" }] : [];
  birds.push({ index: 0, style: "player", showDead: true });

  let message = null;
  if (play.state === "ready") message = ["Press space or tap to start"];
  else if (play.state === "over") {
    let result = play.newBest ? `New best: ${you.score}` : `You scored ${you.score}`;
    if (ghost) result += `, the ghost ${ghost.alive ? "is still going" : `scored ${ghost.score}`}`;
    message = [result, "Tap to try again"];
  }

  fitCanvas(canvas);
  drawWorld(ctx, world, alpha, { birds, score: play.state === "ready" ? undefined : you.score, flash: play.flash, message });
  text(ui.playScore, you.score);
  text(ui.playBest, play.best);
}

function refreshGhost() {
  const has = play.ghostNet !== null;
  ui.ghostToggle.disabled = !has;
  ui.ghostToggle.checked = has && play.ghostOn;
  ui.ghostNote.textContent = has
    ? `From generation ${play.champion.generation + 1}. It scored ${play.champion.score}.`
    : "Run Evolve first to breed one.";
}

ui.ghostToggle.addEventListener("change", () => {
  play.ghostOn = ui.ghostToggle.checked;
  store.set("ghost", play.ghostOn);
  if (play.state !== "running") resetPlay();
});

// --- evolve -------------------------------------------------------------

const settings = {
  speed: "4",
  populationSize: "50",
  mutation: "mid",
  species: "mid",
  course: "varied",
  ...store.get("settings", {}),
};

const evo = {
  trainer: null,
  paused: false,
  acc: 0,
  layoutGenome: null,
  layout: null,
  birds: [],
};

function createTrainer() {
  evo.trainer = new Trainer({
    seed: (Math.random() * 0xffff) >>> 0 || 1,
    populationSize: Number(settings.populationSize),
    mutation: settings.mutation,
    species: settings.species,
    course: settings.course,
    maxScore: MAX_SCORE,
  });
  evo.trainer.onGeneration(onGeneration);
  evo.acc = 0;
  evo.layoutGenome = null;
  drawHistory(ui.history, evo.trainer.history);
}

function onGeneration(_entry, trainer) {
  const champion = trainer.champion;
  if (champion && (!play.champion || champion.score >= play.champion.score)) {
    play.champion = champion;
    play.ghostNet = championNetwork(champion);
    store.set("champion", champion);
    refreshGhost();
  }
  drawHistory(ui.history, trainer.history);
}

function frameEvolve(dt) {
  const trainer = evo.trainer;
  if (!evo.paused) {
    if (settings.speed === "max") {
      const end = performance.now() + 12;
      do {
        for (let k = 0; k < 32; k += 1) trainer.step();
      } while (performance.now() < end);
      evo.acc = 0;
    } else {
      evo.acc += dt * Number(settings.speed);
      let budget = 600;
      while (evo.acc >= DT && budget-- > 0) {
        trainer.step();
        evo.acc -= DT;
      }
      if (budget <= 0) evo.acc = 0;
    }
  }
  const alpha = settings.speed === "max" || evo.paused ? 1 : Math.min(1, evo.acc / DT);

  const world = trainer.world;
  const leaderIndex = trainer.leaderIndex;
  const birds = evo.birds;
  birds.length = 0;
  for (let i = 0; i < world.birds.length; i += 1) {
    if (world.birds[i].alive && i !== leaderIndex) birds.push({ index: i, style: "agent" });
  }
  birds.push({ index: leaderIndex, style: "leader" });

  fitCanvas(canvas);
  drawWorld(ctx, world, alpha, {
    birds,
    follow: leaderIndex,
    score: world.score,
    message: evo.paused ? ["Paused"] : null,
  });

  const leader = trainer.leader;
  if (leader.genome !== evo.layoutGenome) {
    evo.layoutGenome = leader.genome;
    evo.layout = layoutNetwork(leader.genome);
  }
  drawNetwork(ui.network, evo.layout, leader.network, INPUT_LABELS, leader.output > 0.5);

  text(ui.gen, trainer.generation + 1);
  text(ui.alive, `${world.aliveCount} of ${world.birds.length}`);
  text(ui.score, world.score);
  text(ui.record, trainer.record);
}

function setPaused(paused) {
  evo.paused = paused;
  evo.acc = 0;
  ui.pause.textContent = paused ? "Resume" : "Pause";
}

function applySetting(name, value) {
  settings[name] = value;
  store.set("settings", settings);
  syncOptions();
  if (!evo.trainer) return;
  if (name === "populationSize") createTrainer();
  else if (name === "speed") evo.acc = 0;
  else evo.trainer.tune({ [name]: value });
}

function syncOptions() {
  document.querySelectorAll("[data-setting]").forEach((group) => {
    group.querySelectorAll("button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.value === settings[group.dataset.setting]));
    });
  });
}

document.querySelectorAll("[data-setting]").forEach((group) => {
  group.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button) applySetting(group.dataset.setting, button.dataset.value);
  });
});
ui.pause.addEventListener("click", () => setPaused(!evo.paused));
ui.reset.addEventListener("click", () => {
  createTrainer();
  setPaused(false);
});

// --- shell --------------------------------------------------------------

function setMode(next) {
  if (next === mode) return;
  mode = next;
  document.querySelectorAll(".tabs button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });
  document.querySelectorAll("[data-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.pane !== mode;
  });
  if (mode === "evolve") {
    if (!evo.trainer) createTrainer();
    evo.acc = 0;
    requestAnimationFrame(() => drawHistory(ui.history, evo.trainer.history));
  } else if (play.state !== "running") {
    resetPlay(); // picks up a champion bred since the last round
  }
  last = performance.now();
  store.set("mode", mode);
}

document.querySelectorAll(".tabs button").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  if (mode === "play") press();
  else setPaused(!evo.paused);
});

// Space, up and W flap in play mode. In evolve mode Space pauses, 1-4 set the
// speed and R restarts.
const FLAP_KEYS = new Set(["Space", "ArrowUp", "KeyW"]);
window.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (FLAP_KEYS.has(event.code)) {
    // Keeps Space from also clicking a focused button or scrolling the page.
    event.preventDefault();
    if (event.repeat) return;
    if (mode === "play") press();
    else if (event.code === "Space") setPaused(!evo.paused);
    return;
  }
  if (mode !== "evolve" || event.repeat) return;
  const speeds = { Digit1: "1", Digit2: "4", Digit3: "16", Digit4: "max" };
  if (speeds[event.code]) applySetting("speed", speeds[event.code]);
  if (event.code === "KeyR") ui.reset.click();
});
window.addEventListener("keyup", (event) => {
  if (event.code === "Space") event.preventDefault();
});

new ResizeObserver(() => {
  if (evo.trainer) drawHistory(ui.history, evo.trainer.history);
}).observe(ui.history);

let last = performance.now();
function frame(now) {
  // Cap long gaps (a background tab, a debugger pause) so we never try to
  // catch up on minutes of simulation in one go.
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (mode === "play") framePlay(dt, now);
  else frameEvolve(dt);
  requestAnimationFrame(frame);
}

resetPlay();
refreshGhost();
syncOptions();
if (store.get("mode", "play") === "evolve") setMode("evolve");
requestAnimationFrame(frame);
