import { drawBird as paintBird, drawPipe as paintPipe, drawSky } from "/static/drawing.js";

const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const score = document.querySelector("#score");
const best = document.querySelector("#best");
const personalBest = document.querySelector("#personal-best");
const status = document.querySelector("#game-status");
const resetButton = document.querySelector("#reset");

let socket;
window.sandboxMode = "human";
let bestScore = Number(localStorage.getItem("flappy-neat-best") || 0);
best.textContent = bestScore;
personalBest.textContent = bestScore;

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
  if (window.sandboxMode === "human" && event.code === "KeyR") send("reset");
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
  if (state.waiting) drawLaunchHint();

  score.textContent = state.score;
  if (state.score > bestScore) {
    bestScore = state.score;
    localStorage.setItem("flappy-neat-best", String(bestScore));
    best.textContent = bestScore;
    personalBest.textContent = bestScore;
  }
  status.textContent = state.waiting
    ? "Press Space or click to begin"
    : state.alive ? "Space or click to flap" : "Crashed — reset to try again";
}

function drawLaunchHint() {
  context.save();
  context.fillStyle = "#06171bb8";
  context.roundRect(108, 252, 264, 96, 16); context.fill();
  context.strokeStyle = "#aef4d9aa"; context.lineWidth = 1; context.roundRect(108, 252, 264, 96, 16); context.stroke();
  context.fillStyle = "#f1fffb"; context.font = "700 19px system-ui, sans-serif"; context.textAlign = "center"; context.fillText("Ready when you are", 240, 290);
  context.fillStyle = "#a9c9c6"; context.font = "12px ui-monospace, monospace"; context.fillText("SPACE  /  CLICK  TO FLY", 240, 318);
  context.restore();
}

function drawBackdrop() {
  drawSky(context, canvas);
}

function drawPipe(pipe) {
  paintPipe(context, canvas, pipe);
}

function drawBird(bird) {
  paintBird(context, bird.x, bird.y, bird.vy);
}

connect();
