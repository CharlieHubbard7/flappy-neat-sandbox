export function drawSky(context, canvas) {
  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#d7e0e8");
  sky.addColorStop(.62, "#dfe4d8");
  sky.addColorStop(1, "#e9d9ca");
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.save();
  context.globalAlpha = .23;
  context.fillStyle = "#f8f4ea";
  context.fillRect(0, canvas.height - 83, canvas.width, 2);
  context.fillStyle = "#91aaa1";
  context.fillRect(0, canvas.height - 81, canvas.width, 81);
  context.globalAlpha = .16;
  context.fillStyle = "#eaf1db";
  context.fillRect(0, canvas.height - 81, canvas.width, 7);
  context.restore();
}

export function drawPipe(context, canvas, pipe) {
  const gap = 165;
  const top = pipe.gapY - gap / 2;
  const bottom = pipe.gapY + gap / 2;
  const width = 76;
  const fill = context.createLinearGradient(pipe.x, 0, pipe.x + width, 0);
  fill.addColorStop(0, "#3c665e");
  fill.addColorStop(.52, "#6f9279");
  fill.addColorStop(1, "#395f59");

  context.save();
  context.fillStyle = fill;
  context.fillRect(pipe.x, 0, width, top);
  context.fillRect(pipe.x, bottom, width, canvas.height - bottom);
  context.fillStyle = "#d7e5c7";
  context.globalAlpha = .45;
  context.fillRect(pipe.x + 11, 0, 5, top);
  context.fillRect(pipe.x + 11, bottom, 5, canvas.height - bottom);
  context.globalAlpha = 1;
  context.fillStyle = "#557a69";
  context.roundRect(pipe.x - 5, top - 15, width + 10, 16, 5);
  context.fill();
  context.roundRect(pipe.x - 5, bottom, width + 10, 16, 5);
  context.fill();
  context.restore();
}

export function drawBird(context, x, y, velocity, { color = "#cf765f", opacity = 1, leader = false } = {}) {
  context.save();
  context.globalAlpha = opacity;
  context.translate(x, y);
  context.rotate(Math.max(-.42, Math.min(.55, velocity / 760)));
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(0, 0, 15, 13, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = opacity * .7;
  context.fillStyle = "#f3d4b5";
  context.beginPath();
  context.ellipse(-5, -5, 7, 5, -.3, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = opacity;
  context.fillStyle = leader ? "#315f86" : "#b95f50";
  context.beginPath();
  context.ellipse(-6, 4, 9, 5.5, .45, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#d6955b";
  context.roundRect(11, 1, 10, 6, 3);
  context.fill();
  context.fillStyle = "#2e2b29";
  context.beginPath();
  context.arc(5, -4, 2.5, 0, Math.PI * 2);
  context.fill();
  context.restore();
}
