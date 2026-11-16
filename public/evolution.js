import { drawBird, drawPipe, drawSky } from "/drawing.js";

const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const networkCanvas = document.querySelector("#network");
const network = networkCanvas.getContext("2d");
const chartCanvas = document.querySelector("#chart");
const chart = chartCanvas.getContext("2d");
const inspector = document.querySelector("#inspector");
const labels = [document.querySelector("#metric-one-label"), document.querySelector("#metric-two-label"), document.querySelector("#metric-three-label"), document.querySelector("#metric-four-label")];
const values = [document.querySelector("#metric-one-value"), document.querySelector("#metric-two-value"), document.querySelector("#metric-three-value"), document.querySelector("#metric-four-value")];
const third = document.querySelector("#metric-three");
const fourth = document.querySelector("#metric-four");
const telemetry = Object.fromEntries(["generation", "alive", "first-gate", "nodes", "edges"].map((name) => [name, document.querySelector(`#${name}`)]));
const sensors = Object.fromEntries([["vy", "input-vy"], ["dx", "input-dx"], ["dy_top", "input-top"], ["dy_bottom", "input-bottom"]].map(([name, id]) => [name, document.querySelector(`#${id}`)]));
const jumpOutput = document.querySelector("#jump-output");

const INTERPOLATION_MS = 58;
let socket;
let reconnectTimer;
let sourceState;
let targetState;
let receivedAt = 0;
let graph;
let lastHistoryLength = -1;

function socketUrl(path) { return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`; }
function lerp(from, to, amount) { return from + (to - from) * amount; }

function setMode(mode) {
  if (document.body.dataset.mode === mode) return;
  document.body.dataset.mode = mode;
  inspector.hidden = mode !== "evolution";
  third.hidden = mode === "human";
  fourth.hidden = mode === "human";
  document.querySelectorAll(".mode-button").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  window.dispatchEvent(new CustomEvent("sandboxmode", { detail: mode }));
  if (mode === "evolution") connect();
  else {
    close();
    labels.forEach((label, index) => { label.textContent = ["score", "best", "species", "fitness"][index]; });
  }
}

function connect() {
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  clearTimeout(reconnectTimer);
  socket = new WebSocket(socketUrl("/ws/evolution"));
  socket.addEventListener("message", ({ data }) => receive(JSON.parse(data)));
  socket.addEventListener("close", () => {
    if (document.body.dataset.mode === "evolution") reconnectTimer = setTimeout(connect, 700);
  });
}

function close() {
  clearTimeout(reconnectTimer);
  socket?.close();
  socket = undefined;
}

function receive(message) {
  if (message.type !== "state" || document.body.dataset.mode !== "evolution") return;
  const now = performance.now();
  sourceState = targetState ? interpolatedState(now) : message;
  targetState = message;
  receivedAt = now;
  if (message.graph) graph = message.graph;
  updateMetrics(message);
  if (message.graph) drawNetwork(graph, message.leader.output);
  if (lastHistoryLength !== message.history.length) {
    drawChart(message.history);
    lastHistoryLength = message.history.length;
  }
}

function interpolatedState(now) {
  if (!sourceState || !targetState) return targetState || sourceState;
  const amount = Math.min(1, (now - receivedAt) / INTERPOLATION_MS);
  const previousBirds = new Map(sourceState.birds.map((bird) => [bird.id, bird]));
  const birds = targetState.birds.map((bird) => {
    const previous = previousBirds.get(bird.id) || bird;
    return { ...bird, y: lerp(previous.y, bird.y, amount), vy: lerp(previous.vy, bird.vy, amount) };
  });
  const pipes = targetState.pipes.map((pipe, index) => {
    const previous = sourceState.pipes[index] || pipe;
    return { ...pipe, x: lerp(previous.x, pipe.x, amount), gapY: lerp(previous.gapY, pipe.gapY, amount) };
  });
  const previousLeader = previousBirds.get(targetState.leader.id) || sourceState.leader || targetState.leader;
  return {
    ...targetState,
    birds,
    pipes,
    leader: {
      ...targetState.leader,
      y: lerp(previousLeader.y, targetState.leader.y, amount),
      vy: lerp(previousLeader.vy, targetState.leader.vy, amount),
    },
  };
}

function animate(now) {
  if (document.body.dataset.mode === "evolution" && targetState) {
    const state = interpolatedState(now);
    drawWorld(state);
    if (graph) drawNetwork(graph, state.leader.output);
  }
  requestAnimationFrame(animate);
}

function drawWorld(state) {
  drawSky(context, canvas);
  state.pipes.forEach((pipe) => drawPipe(context, canvas, pipe));
  state.birds.forEach((bird) => drawBird(context, 130, bird.y, bird.vy, {
    color: bird.leader ? "#315f86" : "#c97763",
    opacity: bird.leader ? 1 : .22,
    leader: bird.leader,
  }));
}

function updateMetrics(state) {
  [["generation", state.generation], ["alive", `${state.alive}/${state.population}`], ["species", state.species], ["fitness", state.bestFitness.toFixed(1)]].forEach(([label, value], index) => {
    labels[index].textContent = label;
    values[index].textContent = value;
  });
  telemetry.generation.textContent = state.generation;
  telemetry.alive.textContent = `${state.alive}/${state.population}`;
  telemetry["first-gate"].textContent = `${state.lastFirstGate || state.passedFirstGate}/${state.population}`;
  telemetry.nodes.textContent = graph ? graph.nodes.length : "—";
  telemetry.edges.textContent = graph ? graph.connections.length : "—";
  Object.entries(state.leader.inputs).forEach(([name, value]) => { sensors[name].textContent = Number(value).toFixed(2); });
  jumpOutput.textContent = state.leader.output.toFixed(2);
}

function drawNetwork(state, output) {
  const { width, height } = networkCanvas;
  network.clearRect(0, 0, width, height);
  const inputs = [-1, -2, -3, -4];
  const hidden = state.nodes.filter((node) => !inputs.includes(node) && node !== 0);
  const positions = new Map();
  inputs.forEach((node, index) => positions.set(node, { x: 36, y: 38 + index * ((height - 76) / 3) }));
  hidden.forEach((node, index) => positions.set(node, { x: width / 2, y: height / 2 + (index - (hidden.length - 1) / 2) * Math.min(44, (height - 82) / Math.max(1, hidden.length)) }));
  positions.set(0, { x: width - 36, y: height / 2 });
  const newEdges = new Set(state.newConnections.map((edge) => edge.join(":")));
  state.connections.forEach((edge) => {
    const from = positions.get(edge.from); const to = positions.get(edge.to); if (!from || !to) return;
    network.strokeStyle = newEdges.has(`${edge.from}:${edge.to}`) ? "#d0a24e" : edge.weight >= 0 ? "#4f8178" : "#c97763";
    network.globalAlpha = Math.min(.84, .18 + Math.abs(edge.weight) / 3);
    network.lineWidth = 1 + Math.min(3.2, Math.abs(edge.weight));
    network.beginPath(); network.moveTo(from.x + 8, from.y); network.lineTo(to.x - 8, to.y); network.stroke();
  });
  network.globalAlpha = 1;
  state.nodes.forEach((node) => {
    const point = positions.get(node); if (!point) return;
    const activation = Math.min(1, Math.abs(state.activations[String(node)] || 0));
    const activeOutput = node === 0 && output > .5;
    network.fillStyle = activeOutput ? "#315f86" : `rgba(79, 129, 120, ${.22 + activation * .72})`;
    network.beginPath(); network.arc(point.x, point.y, activeOutput ? 10 : 8, 0, Math.PI * 2); network.fill();
  });
}

function drawChart(history) {
  const { width, height } = chartCanvas;
  chart.clearRect(0, 0, width, height);
  if (history.length < 2) return;
  const ceiling = Math.max(1, ...history.flatMap((point) => [point.max, point.avg]));
  [["max", "#315f86"], ["avg", "#9a8c7d"]].forEach(([key, color]) => {
    chart.strokeStyle = color; chart.lineWidth = 1.6; chart.beginPath();
    history.forEach((point, index) => {
      const x = 10 + (index / (history.length - 1)) * (width - 20);
      const y = height - 10 - (point[key] / ceiling) * (height - 20);
      index ? chart.lineTo(x, y) : chart.moveTo(x, y);
    });
    chart.stroke();
  });
}

document.querySelectorAll(".mode-button").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
requestAnimationFrame(animate);
