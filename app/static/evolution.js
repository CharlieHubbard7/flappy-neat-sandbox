const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const networkCanvas = document.querySelector("#network");
const network = networkCanvas.getContext("2d");
const chartCanvas = document.querySelector("#chart");
const chart = chartCanvas.getContext("2d");
const status = document.querySelector("#game-status");
const humanControls = document.querySelector(".human-controls");
const evolutionControls = document.querySelector(".evolution-controls");
const score = document.querySelector("#score");
const best = document.querySelector("#best");
const scoreName = document.querySelector("#score-name");
const bestName = document.querySelector("#best-name");
const toggle = document.querySelector("#toggle");
const telemetry = Object.fromEntries(["generation", "alive", "species", "fitness", "first-gate"].map((name) => [name, document.querySelector(`#${name}`)]));
const mutation = document.querySelector("#mutation-note");
const humanGuide = document.querySelector("#human-guide");
const evolutionContent = document.querySelector("#evolution-content");
const inputReadouts = {
  vy: document.querySelector("#input-vy"),
  dx: document.querySelector("#input-dx"),
  dy_top: document.querySelector("#input-top"),
  dy_bottom: document.querySelector("#input-bottom"),
};
const jumpValue = document.querySelector("#jump-value");
let socket;
let paused = false;

function url(path) { return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`; }
function send(type, value) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, value })); }

function connect() {
  socket = new WebSocket(url("/ws/evolution"));
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === "state" && window.sandboxMode === "evolution") render(message);
    if (message.type === "saved" || message.type === "loaded") status.textContent = message.ok ? "Champion genome ready." : "No champion has finished yet.";
  });
  socket.addEventListener("close", () => { if (window.sandboxMode === "evolution") setTimeout(connect, 800); });
}

function setMode(mode) {
  if (window.sandboxMode === mode) return;
  window.sandboxMode = mode;
  document.querySelectorAll(".mode-button").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  humanControls.hidden = mode !== "human";
  evolutionControls.hidden = mode !== "evolution";
  humanGuide.hidden = mode !== "human";
  evolutionContent.hidden = mode !== "evolution";
  scoreName.textContent = mode === "human" ? "Score" : "Generation";
  bestName.textContent = mode === "human" ? "Best" : "Fitness";
  window.dispatchEvent(new CustomEvent("sandboxmode", { detail: mode }));
  if (mode === "evolution") {
    status.textContent = "Training 50 birds on the same course";
    connect();
  } else {
    socket?.close();
  }
}

document.querySelectorAll(".mode-button").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
toggle.addEventListener("click", () => { paused = !paused; toggle.textContent = paused ? "Play" : "Pause"; send("toggle"); });
document.querySelectorAll(".speed").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".speed").forEach((item) => item.classList.toggle("active", item === button));
  send("speed", button.dataset.speed);
}));
document.querySelector("#evolution-reset").addEventListener("click", () => send("reset"));
document.querySelector("#save-champion").addEventListener("click", () => send("save"));
document.querySelector("#load-champion").addEventListener("click", () => send("load"));

function render(state) {
  drawWorld(state.pipes);
  state.birds.forEach((bird) => drawBird(130, bird.y, bird.vy, bird.leader ? "#a4f763" : "#50cfba", bird.leader ? 1 : 0.22));
  drawSensorRays(state, state.pipes[0]);
  score.textContent = state.generation;
  best.textContent = state.bestFitness.toFixed(1);
  telemetry.generation.textContent = state.generation;
  telemetry.alive.textContent = `${state.alive} / ${state.population}`;
  telemetry.species.textContent = state.species;
  telemetry.fitness.textContent = state.bestFitness.toFixed(2);
  telemetry["first-gate"].textContent = `${state.lastFirstGate || state.passedFirstGate} / ${state.population}`;
  Object.entries(state.leader.inputs).forEach(([name, value]) => {
    inputReadouts[name].textContent = Number(value).toFixed(2);
  });
  jumpValue.textContent = state.leader.output.toFixed(2);
  jumpValue.parentElement.classList.toggle("active", state.leader.output > 0.5);
  const addedNodes = state.graph.newNodes.length;
  const addedEdges = state.graph.newConnections.length;
  mutation.textContent = addedNodes || addedEdges ? `new: ${addedNodes} node${addedNodes === 1 ? "" : "s"}, ${addedEdges} edge${addedEdges === 1 ? "" : "s"}` : "stable topology";
  drawNetwork(state.graph, state.leader.output);
  drawChart(state.history);
}

function drawWorld(pipes) {
  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#113a48"); sky.addColorStop(0.62, "#0f6670"); sky.addColorStop(1, "#143d42");
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f6d999"; context.globalAlpha = 0.18; context.beginPath(); context.arc(372, 104, 56, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#c6f1da";
  for (const [x, y, radius] of [[42, 94, 20], [84, 126, 34], [430, 240, 25], [388, 270, 37]]) { context.globalAlpha = 0.07; context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill(); }
  context.fillStyle = "#0b2d33"; context.globalAlpha = 0.45; context.fillRect(0, canvas.height - 54, canvas.width, 54);
  context.globalAlpha = 1;
  pipes.forEach((pipe) => {
    const top = pipe.gapY - 82.5; const bottom = pipe.gapY + 82.5;
    const pipePaint = context.createLinearGradient(pipe.x, 0, pipe.x + 76, 0);
    pipePaint.addColorStop(0, "#195d58"); pipePaint.addColorStop(0.5, "#35ad92"); pipePaint.addColorStop(1, "#0f4d4b");
    context.fillStyle = pipePaint; context.fillRect(pipe.x, 0, 76, top); context.fillRect(pipe.x, bottom, 76, canvas.height - bottom);
    context.fillStyle = "#8bf1cb"; context.globalAlpha = 0.72; context.fillRect(pipe.x + 10, 0, 5, top); context.fillRect(pipe.x + 10, bottom, 5, canvas.height - bottom); context.globalAlpha = 1;
    context.fillStyle = "#247b6d"; context.roundRect(pipe.x - 5, top - 14, 86, 15, 5); context.fill(); context.roundRect(pipe.x - 5, bottom, 86, 15, 5); context.fill();
  });
}

function drawBird(x, y, vy, color, alpha) {
  context.save(); context.globalAlpha = alpha; context.translate(x, y); context.rotate(Math.max(-0.5, Math.min(0.7, vy / 700)));
  context.fillStyle = color; context.beginPath(); context.arc(0, 0, 14, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#e9ac50"; context.beginPath(); context.ellipse(-6, 4, 8, 5, 0.4, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#172024"; context.beginPath(); context.arc(5, -4, 2.4, 0, Math.PI * 2); context.fill(); context.restore();
}

function drawSensorRays(state, nextPipe) {
  if (!state.birds.length) return;
  const bird = state.leader;
  context.save(); context.setLineDash([4, 5]); context.lineWidth = 1; context.strokeStyle = "#d0ffe6"; context.fillStyle = "#d0ffe6"; context.globalAlpha = 0.55;
  const targets = nextPipe ? [[nextPipe.x, bird.y, "dx"], [nextPipe.x, nextPipe.gapY - 82, "top"], [nextPipe.x, nextPipe.gapY + 82, "bottom"]] : [[310, bird.y, "dx"]];
  targets.forEach(([x, y, label]) => { context.beginPath(); context.moveTo(130, bird.y); context.lineTo(x, y); context.stroke(); context.fillText(label, x + 5, y - 5); });
  context.setLineDash([]); context.fillText(`vy ${bird.vy.toFixed(0)}`, 145, bird.y - 22); context.restore();
}

function drawNetwork(graph, output) {
  const { width, height } = networkCanvas;
  network.clearRect(0, 0, width, height);
  const inputs = [-1, -2, -3, -4];
  const hidden = graph.nodes.filter((node) => !inputs.includes(node) && node !== 0);
  const positions = new Map();
  inputs.forEach((node, index) => positions.set(node, { x: 42, y: 38 + index * 70, label: ["vy", "dx", "dy top", "dy bottom"][index] }));
  hidden.forEach((node, index) => positions.set(node, { x: width / 2, y: 55 + index * Math.min(62, 180 / Math.max(1, hidden.length - 1)), label: `h${node}` }));
  positions.set(0, { x: width - 42, y: height / 2, label: "jump" });
  const newEdges = new Set(graph.newConnections.map((edge) => edge.join(":")));
  graph.connections.forEach((edge) => {
    const from = positions.get(edge.from); const to = positions.get(edge.to); if (!from || !to) return;
    network.strokeStyle = newEdges.has(`${edge.from}:${edge.to}`) ? "#f8d66d" : edge.weight >= 0 ? "#36cbb3" : "#ef7765";
    network.globalAlpha = Math.min(0.88, 0.25 + Math.abs(edge.weight) / 3); network.lineWidth = 1 + Math.min(4, Math.abs(edge.weight));
    network.beginPath(); network.moveTo(from.x + 10, from.y); network.lineTo(to.x - 10, to.y); network.stroke();
  });
  network.globalAlpha = 1;
  graph.nodes.forEach((node) => {
    const point = positions.get(node); if (!point) return;
    const activation = Math.min(1, Math.abs(graph.activations[String(node)] || 0)); const isOutput = node === 0;
    network.fillStyle = isOutput && output > 0.5 ? "#a4f763" : `rgba(77, 226, 196, ${0.22 + activation * 0.78})`;
    network.shadowColor = network.fillStyle; network.shadowBlur = activation * 15 + (isOutput && output > 0.5 ? 12 : 0);
    network.beginPath(); network.arc(point.x, point.y, 11, 0, Math.PI * 2); network.fill(); network.shadowBlur = 0;
    network.fillStyle = "#b8cccf"; network.font = "10px ui-monospace, monospace"; network.fillText(point.label, point.x - 17, point.y + 25);
  });
}

function drawChart(history) {
  const { width, height } = chartCanvas;
  chart.clearRect(0, 0, width, height);
  if (history.length < 2) return;
  const ceiling = Math.max(1, ...history.flatMap((item) => [item.max, item.avg]));
  [["max", "#a4f763"], ["avg", "#4ce2c4"]].forEach(([key, color]) => {
    chart.strokeStyle = color; chart.lineWidth = 1.8; chart.beginPath();
    history.forEach((point, index) => {
      const x = 10 + (index / (history.length - 1)) * (width - 20);
      const y = height - 10 - (point[key] / ceiling) * (height - 20);
      index ? chart.lineTo(x, y) : chart.moveTo(x, y);
    });
    chart.stroke();
  });
}
