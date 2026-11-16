const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const score = document.querySelector("#score");
const best = document.querySelector("#best");
const status = document.querySelector("#game-status");
const resetButton = document.querySelector("#reset");

let socket;
let bestScore = Number(localStorage.getItem("flappy-neat-best") || 0);
best.textContent = bestScore;

function connect() {
  socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/play`);
  socket.addEventListener("message", ({ data }) => render(JSON.parse(data)));
  socket.addEventListener("close", () => {
    status.textContent = "Reconnecting game server…";
    setTimeout(connect, 800);
  });
}

function send(type) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type }));
}

function flap() { send("flap"); }
canvas.addEventListener("pointerdown", flap);
window.addEventListener("keydown", (event) => {
  if (event.code === "Space") { event.preventDefault(); flap(); }
});
resetButton.addEventListener("click", () => send("reset"));

function render(state) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawBackdrop();
  state.pipes.forEach(drawPipe);
  drawBird(state.bird);

  score.textContent = state.score;
  if (state.score > bestScore) {
    bestScore = state.score;
    localStorage.setItem("flappy-neat-best", String(bestScore));
    best.textContent = bestScore;
  }
  status.textContent = state.alive ? "Space or click to flap" : "Crashed — reset to try again";
}

function drawBackdrop() {
  context.fillStyle = "#0b252b";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#236368";
  context.globalAlpha = 0.2;
  for (let x = 0; x < canvas.width; x += 40) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke(); }
  context.globalAlpha = 1;
}

function drawPipe(pipe) {
  const gap = 165;
  const top = pipe.gapY - gap / 2;
  const bottom = pipe.gapY + gap / 2;
  context.fillStyle = "#1d8278";
  context.fillRect(pipe.x, 0, 76, top);
  context.fillRect(pipe.x, bottom, 76, canvas.height - bottom);
  context.fillStyle = "#56e4c8";
  context.fillRect(pipe.x - 4, top - 12, 84, 12);
  context.fillRect(pipe.x - 4, bottom, 84, 12);
}

function drawBird(bird) {
  context.save();
  context.translate(bird.x, bird.y);
  context.rotate(Math.max(-0.5, Math.min(0.7, bird.vy / 700)));
  context.fillStyle = "#f8d66d";
  context.beginPath(); context.arc(0, 0, 14, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#172024";
  context.beginPath(); context.arc(5, -4, 2.4, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#fd8069";
  context.beginPath(); context.moveTo(11, 1); context.lineTo(22, 5); context.lineTo(11, 8); context.fill();
  context.restore();
}

connect();
