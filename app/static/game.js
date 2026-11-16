const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const score = document.querySelector("#score");
const best = document.querySelector("#best");
const status = document.querySelector("#game-status");
const resetButton = document.querySelector("#reset");

let socket;
window.sandboxMode = "human";
let bestScore = Number(localStorage.getItem("flappy-neat-best") || 0);
best.textContent = bestScore;

function connect() {
  socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/play`);
  socket.addEventListener("message", ({ data }) => {
    if (window.sandboxMode === "human") render(JSON.parse(data));
  });
  socket.addEventListener("close", () => {
    if (window.sandboxMode === "human") {
      status.textContent = "Reconnecting game server…";
      setTimeout(connect, 800);
    }
  });
}

function send(type) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type }));
}

function flap() { send("flap"); }
canvas.addEventListener("pointerdown", () => { if (window.sandboxMode === "human") flap(); });
window.addEventListener("keydown", (event) => {
  if (window.sandboxMode === "human" && event.code === "Space") { event.preventDefault(); flap(); }
});
resetButton.addEventListener("click", () => send("reset"));

window.addEventListener("sandboxmode", ({ detail }) => {
  if (detail === "human") {
    status.textContent = "Space or click to flap";
    connect();
  } else {
    socket?.close();
  }
});

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
  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#113a48");
  sky.addColorStop(0.62, "#0f6670");
  sky.addColorStop(1, "#143d42");
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f6d999";
  context.globalAlpha = 0.18;
  context.beginPath(); context.arc(372, 104, 56, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#c6f1da";
  for (const [x, y, radius] of [[42, 94, 20], [84, 126, 34], [430, 240, 25], [388, 270, 37]]) {
    context.globalAlpha = 0.07; context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
  }
  context.fillStyle = "#0b2d33";
  context.globalAlpha = 0.45;
  context.fillRect(0, canvas.height - 54, canvas.width, 54);
  context.globalAlpha = 1;
}

function drawPipe(pipe) {
  const gap = 165;
  const top = pipe.gapY - gap / 2;
  const bottom = pipe.gapY + gap / 2;
  const pipePaint = context.createLinearGradient(pipe.x, 0, pipe.x + 76, 0);
  pipePaint.addColorStop(0, "#195d58"); pipePaint.addColorStop(0.5, "#35ad92"); pipePaint.addColorStop(1, "#0f4d4b");
  context.fillStyle = pipePaint;
  context.fillRect(pipe.x, 0, 76, top);
  context.fillRect(pipe.x, bottom, 76, canvas.height - bottom);
  context.fillStyle = "#8bf1cb";
  context.globalAlpha = 0.72;
  context.fillRect(pipe.x + 10, 0, 5, top); context.fillRect(pipe.x + 10, bottom, 5, canvas.height - bottom);
  context.globalAlpha = 1;
  context.fillStyle = "#247b6d";
  context.roundRect(pipe.x - 5, top - 14, 86, 15, 5); context.fill();
  context.roundRect(pipe.x - 5, bottom, 86, 15, 5); context.fill();
}

function drawBird(bird) {
  context.save();
  context.translate(bird.x, bird.y);
  context.rotate(Math.max(-0.5, Math.min(0.7, bird.vy / 700)));
  context.fillStyle = "#f8d66d";
  context.beginPath(); context.arc(0, 0, 14, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#e9ac50";
  context.beginPath(); context.ellipse(-6, 4, 8, 5, 0.4, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#172024";
  context.beginPath(); context.arc(5, -4, 2.4, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#fd8069";
  context.beginPath(); context.moveTo(11, 1); context.lineTo(22, 5); context.lineTo(11, 8); context.fill();
  context.restore();
}

connect();
