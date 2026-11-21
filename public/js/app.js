import { CONFIG, World } from "./world.js";
import { INPUT_LABELS, Trainer, championNetwork, sense } from "./trainer.js";
import { drawWorld, fitCanvas } from "./render.js";
import { drawHistory, drawNetwork, drawSpecies, layoutNetwork } from "./viz.js";

const $ = (selector) => document.querySelector(selector);
const DT = CONFIG.dt;
const MAX_SCORE = 100;
const pad = (value, width = 2) => String(value).padStart(width, "0");

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
      /* storage can be unavailable; nothing here depends on it */
    }
  },
};

// Writes to the DOM only when a value actually changes.
const shown = new Map();
function text(element, value) {
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
  playGhost: $("#play-ghost"),
  ghostNote: $("#ghost-note"),
  ghostButtons: [...document.querySelectorAll("#ghost-toggle button")],
  gen: $("#evo-gen"),
  alive: $("#evo-alive"),
  species: $("#evo-species"),
  score: $("#evo-score"),
  record: $("#evo-record"),
  netMeta: $("#net-meta"),
  speciesMeta: $("#species-meta"),
  network: $("#network"),
  history: $("#history"),
  speciesBar: $("#species"),
  readout: $("#readout"),
  pause: $("#pause"),
  reset: $("#reset"),
  statusLeft: $("#status-left"),
  statusRight: $("#status-right"),
};

let mode = "play";

/* ---------------------------------------------------------------- play */

const play = {
  world: null,
  state: "ready", // ready -> running -> over
  queuedFlap: false,
  diedAt: 0,
  flash: 0,
  best: Number(store.get("best", 0)) || 0,
  newBest: false,
  ghostOn: Boolean(store.get("ghost", true)),
  champion: store.get("champion", null),
  ghostNet: null,
  ghostInputs: new Float64Array(4),
  acc: 0,
  flaps: [0, 0],
};
play.ghostNet = championNetwork(play.champion);

function ghostActive() {
  return play.ghostOn && play.ghostNet !== null;
}

function resetPlay() {
  const seed = (Math.random() * 2 ** 32) >>> 0;
  play.world = new World(seed, ghostActive() ? 2 : 1);
  play.state = "ready";
  play.queuedFlap = false;
  play.acc = 0;
  play.newBest = false;
}

function press() {
  if (mode !== "play") return;
  if (play.state === "over") {
    if (performance.now() - play.diedAt < 450) return; // swallow the panic taps
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
  if (!world.birds[0].alive) {
    play.state = "over";
    play.diedAt = performance.now();
    play.flash = 1;
    if (world.birds[0].score > play.best) {
      play.best = world.birds[0].score;
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
    // Idle hover until the first flap. Not part of the simulation.
    const y = CONFIG.height / 2 + Math.sin(now / 260) * 5;
    for (const bird of world.birds) {
      bird.prevY = bird.y = y;
      bird.vy = bird.prevVy = 0;
    }
  }
  play.flash = Math.max(0, play.flash - dt * 6);

  const you = world.birds[0];
  const ghost = world.birds[1];
  const birds = [];
  if (ghost) birds.push({ index: 1, style: "ghost" });
  birds.push({ index: 0, style: "player", showDead: true });

  let message = null;
  if (play.state === "ready") {
    message = { title: "READY", lines: ghost ? ["GHOST: DASHED SQUARE", "SPACE · ↑ · TAP TO FLAP"] : ["SPACE · ↑ · TAP TO FLAP"] };
  } else if (play.state === "over") {
    const lines = [`SCORE ${pad(you.score)}   BEST ${pad(play.best)}${play.newBest ? "  NEW" : ""}`];
    if (ghost) lines.push(`GHOST ${pad(ghost.score)}${ghost.alive ? " AND STILL FLYING" : ""}`);
    lines.push("SPACE · TAP TO RETRY");
    message = { title: "GAME OVER", lines };
  }

  fitCanvas(canvas);
  drawWorld(ctx, world, alpha, { birds, score: you.score, flash: play.flash, message });

  text(ui.playScore, pad(you.score));
  text(ui.playBest, pad(play.best));
  text(ui.playGhost, ghost ? pad(ghost.score) : "--");
  ui.statusLeft.textContent = `COURSE ${world.seed.toString(16).toUpperCase().padStart(8, "0")} · FIXED STEP 60 HZ`;
  ui.statusRight.textContent = `${Math.round(fps)} FPS`;
}

function refreshGhostUi() {
  const has = play.ghostNet !== null;
  ui.ghostButtons.forEach((button) => {
    button.disabled = !has;
    button.setAttribute("aria-pressed", String(has && (button.dataset.value === "on") === play.ghostOn));
  });
  ui.ghostNote.textContent = has
    ? `Champion from generation ${play.champion.generation}, which scored ${play.champion.score} on its course. It sees the same four sensor values the trainer uses.`
    : "No champion yet. Run EVOLVE to breed one.";
}

ui.ghostButtons.forEach((button) =>
  button.addEventListener("click", () => {
    play.ghostOn = button.dataset.value === "on";
    store.set("ghost", play.ghostOn);
    refreshGhostUi();
    if (play.state !== "running") resetPlay();
  }),
);

/* -------------------------------------------------------------- evolve */

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
  seed: 1,
  birds: [],
  stepsWindow: { at: 0, steps: 0, rate: 0 },
};

function createTrainer() {
  evo.seed = (Math.random() * 0xffff) >>> 0 || 1;
  evo.trainer = new Trainer({
    seed: evo.seed,
    populationSize: Number(settings.populationSize),
    mutation: settings.mutation,
    species: settings.species,
    course: settings.course,
    maxScore: MAX_SCORE,
  });
  evo.trainer.onGeneration(onGeneration);
  evo.acc = 0;
  evo.layoutGenome = null;
  evo.stepsWindow = { at: performance.now(), steps: 0, rate: 0 };
  drawGenerationCharts();
}

function onGeneration(_entry, trainer) {
  const champion = trainer.champion;
  const stored = play.champion;
  if (champion && (!stored || champion.score >= stored.score)) {
    play.champion = champion;
    play.ghostNet = championNetwork(champion);
    store.set("champion", champion);
    refreshGhostUi();
  }
  drawGenerationCharts();
}

function drawGenerationCharts() {
  const trainer = evo.trainer;
  if (!trainer) return;
  drawHistory(ui.history, trainer.history, MAX_SCORE);
  const leader = trainer.leader.genome;
  drawSpecies(ui.speciesBar, trainer.population.species, leader.speciesId);
  const sizes = trainer.population.species.map((s) => s.members.length).sort((a, b) => b - a);
  text(ui.speciesMeta, `THRESHOLD ${trainer.population.threshold.toFixed(2)} · LARGEST ${sizes[0]}`);
}

function frameEvolve(dt) {
  const trainer = evo.trainer;
  const before = trainer.steps;
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

  const now = performance.now();
  const meter = evo.stepsWindow;
  meter.steps += trainer.steps - before;
  if (now - meter.at > 500) {
    meter.rate = (meter.steps * 1000) / (now - meter.at);
    meter.at = now;
    meter.steps = 0;
  }

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
    sensors: leaderIndex,
    score: world.score,
    message: evo.paused ? { title: "PAUSED", lines: ["SPACE · CLICK TO RESUME"] } : null,
  });

  const leader = trainer.leader;
  if (leader.genome !== evo.layoutGenome) {
    evo.layoutGenome = leader.genome;
    evo.layout = layoutNetwork(leader.genome);
    drawSpecies(ui.speciesBar, trainer.population.species, leader.genome.speciesId);
  }
  const flapping = leader.output > 0.5;
  drawNetwork(ui.network, evo.layout, leader.network, INPUT_LABELS, flapping);

  text(ui.gen, pad(trainer.generation, 3));
  text(ui.alive, `${world.aliveCount}/${world.birds.length}`);
  text(ui.species, String(trainer.population.species.length));
  text(ui.score, pad(world.score));
  text(ui.record, pad(trainer.record));
  text(ui.netMeta, `#${leader.genome.id} · ${leader.genome.hiddenCount} HIDDEN · ${leader.genome.enabledCount} LINKS`);
  updateReadout(leader.inputs, leader.output);

  const speed = settings.speed === "max" ? "MAX" : `${settings.speed}×`;
  ui.statusLeft.textContent = `SEED ${pad(evo.seed, 5)} · COURSE ${trainer.courseSeed().toString(16).toUpperCase().padStart(8, "0")} · ${speed}`;
  ui.statusRight.textContent = `${Math.round(meter.rate).toLocaleString("en-US")} STEPS/S · ${Math.round(fps)} FPS`;
}

// Five small cells: each sensor value with a bar from zero, then the output
// against the 0.5 flap threshold.
const readoutCells = [...INPUT_LABELS, "FLAP"].map((label, i) => {
  const cell = document.createElement("div");
  cell.className = i === INPUT_LABELS.length ? "sig out" : "sig";
  cell.innerHTML = `<span>${label}</span><b>+0.00</b><i></i>`;
  ui.readout.append(cell);
  return { cell, value: cell.querySelector("b"), bar: cell.querySelector("i") };
});
let readoutAt = 0;

function updateReadout(inputs, output) {
  const now = performance.now();
  if (now - readoutAt < 60) return;
  readoutAt = now;
  inputs.forEach((value, i) => {
    const { value: label, bar } = readoutCells[i];
    text(label, `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`);
    const v = Math.max(-1, Math.min(1, value));
    bar.style.setProperty("--l", `${50 + Math.min(0, v) * 50}%`);
    bar.style.setProperty("--w", `${Math.abs(v) * 50}%`);
  });
  const out = readoutCells[INPUT_LABELS.length];
  text(out.value, output.toFixed(2));
  out.bar.style.setProperty("--l", "0%");
  out.bar.style.setProperty("--w", `${output * 100}%`);
  out.cell.classList.toggle("on", output > 0.5);
}

function setPaused(paused) {
  evo.paused = paused;
  evo.acc = 0;
  ui.pause.textContent = paused ? "RESUME" : "PAUSE";
  ui.pause.setAttribute("aria-pressed", String(paused));
}

function applySetting(name, value) {
  settings[name] = value;
  store.set("settings", settings);
  syncSettingButtons();
  if (!evo.trainer) return;
  if (name === "populationSize") createTrainer();
  else if (name !== "speed") evo.trainer.tune({ [name]: value });
  if (name === "speed") evo.acc = 0;
}

function syncSettingButtons() {
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

/* ---------------------------------------------------------------- shell */

function setMode(next) {
  if (next === mode) return;
  mode = next;
  document.body.dataset.mode = mode;
  document.querySelectorAll(".tabs button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });
  document.querySelectorAll("[data-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.pane !== mode;
  });
  ui.statusRight.textContent = "";
  if (mode === "evolve") {
    if (!evo.trainer) createTrainer();
    evo.acc = 0;
    requestAnimationFrame(drawGenerationCharts);
  } else {
    // Pick up a champion bred since the last round.
    if (play.state !== "running") resetPlay();
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

const FLAP_KEYS = new Set(["Space", "ArrowUp", "KeyW"]);
window.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (FLAP_KEYS.has(event.code)) {
    // Stops Space from also clicking whichever button has focus, and from
    // scrolling the page.
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
  if (mode === "evolve") drawGenerationCharts();
}).observe(ui.history);

let last = performance.now();
let fps = 60;
function frame(now) {
  // Clamp long gaps (a background tab, a debugger pause) so we never try to
  // catch up on minutes of simulation in one frame.
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (dt > 0) fps += (1 / dt - fps) * 0.05;
  if (mode === "play") framePlay(dt, now);
  else frameEvolve(dt);
  requestAnimationFrame(frame);
}

resetPlay();
refreshGhostUi();
syncSettingButtons();
if (store.get("mode", "play") === "evolve") setMode("evolve");
if (document.fonts?.ready) document.fonts.ready.then(drawGenerationCharts);
requestAnimationFrame(frame);
