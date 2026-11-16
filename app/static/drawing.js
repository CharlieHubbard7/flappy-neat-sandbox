export function drawSky(context, canvas) {
  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#cedbe7");
  sky.addColorStop(0.5, "#b7d2d4");
  sky.addColorStop(1, "#d3c8bd");
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.save();
  context.globalAlpha = 0.2;
  context.fillStyle = "#f4c9bd";
  context.beginPath(); context.arc(375, 102, 57, 0, Math.PI * 2); context.fill();
  context.globalAlpha = 0.08;
  context.fillStyle = "#f3eee4";
  [[35, 90, 20], [78, 122, 35], [422, 228, 28], [383, 260, 38]].forEach(([x, y, radius]) => {
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
  });

  context.globalAlpha = 0.18;
  context.fillStyle = "#547883";
  mountain(context, 0, 496, 130, 420, 510, 356, 605);
  mountain(context, 280, 510, 410, 390, 510, 448, 605);
  context.globalAlpha = 0.28;
  context.fillStyle = "#51736f";
  mountain(context, -80, 560, 88, 432, 255, 532, 640);
  mountain(context, 250, 564, 395, 430, 556, 505, 640);
  context.restore();

  const ground = context.createLinearGradient(0, canvas.height - 62, 0, canvas.height);
  ground.addColorStop(0, "#90aba4"); ground.addColorStop(1, "#78978f");
  context.fillStyle = ground;
  context.fillRect(0, canvas.height - 62, canvas.width, 62);
  context.fillStyle = "#e7ead8";
  context.globalAlpha = 0.52;
  context.fillRect(0, canvas.height - 62, canvas.width, 2);
  context.globalAlpha = 1;
}

function mountain(context, x1, y1, peakX, peakY, x2, y2, baseY) {
  context.beginPath(); context.moveTo(x1, y1); context.lineTo(peakX, peakY); context.lineTo(x2, y2); context.lineTo(x2, baseY); context.lineTo(x1, baseY); context.closePath(); context.fill();
}

export function drawPipe(context, canvas, pipe) {
  const gap = 165;
  const top = pipe.gapY - gap / 2;
  const bottom = pipe.gapY + gap / 2;
  const paint = context.createLinearGradient(pipe.x, 0, pipe.x + 76, 0);
  paint.addColorStop(0, "#496f63"); paint.addColorStop(0.52, "#7e9e83"); paint.addColorStop(1, "#3f655d");

  context.save();
  context.shadowColor = "#5c544633"; context.shadowBlur = 12; context.shadowOffsetX = 3;
  context.fillStyle = paint;
  context.fillRect(pipe.x, 0, 76, top);
  context.fillRect(pipe.x, bottom, 76, canvas.height - bottom);
  context.shadowColor = "transparent";
  context.fillStyle = "#dce8cb";
  context.globalAlpha = 0.7;
  context.fillRect(pipe.x + 10, 0, 5, top);
  context.fillRect(pipe.x + 10, bottom, 5, canvas.height - bottom);
  context.globalAlpha = 1;
  context.fillStyle = "#63826c";
  context.roundRect(pipe.x - 6, top - 15, 88, 16, 5); context.fill();
  context.roundRect(pipe.x - 6, bottom, 88, 16, 5); context.fill();
  context.fillStyle = "#cbdcb8";
  context.globalAlpha = 0.55;
  context.fillRect(pipe.x - 1, top - 12, 78, 2); context.fillRect(pipe.x - 1, bottom + 2, 78, 2);
  context.restore();
}

export function drawBird(context, x, y, velocity, { color = "#d67b60", opacity = 1, leader = false } = {}) {
  context.save();
  context.globalAlpha = opacity;
  context.translate(x, y);
  context.rotate(Math.max(-0.48, Math.min(0.7, velocity / 700)));
  if (leader) {
    context.fillStyle = "#315f86";
    context.globalAlpha = opacity * 0.16;
    context.beginPath(); context.arc(0, 0, 28, 0, Math.PI * 2); context.fill();
    context.globalAlpha = opacity;
  }
  context.fillStyle = color;
  context.beginPath(); context.ellipse(0, 0, 15, 13, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#f5d6b5";
  context.globalAlpha = opacity * 0.78;
  context.beginPath(); context.ellipse(-5, -5, 7, 5, -0.3, 0, Math.PI * 2); context.fill();
  context.globalAlpha = opacity;
  context.fillStyle = leader ? "#254f73" : "#b85f50";
  context.beginPath(); context.ellipse(-6, 4, 9, 5.5, 0.45, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#c56a51";
  context.beginPath(); context.moveTo(12, 0); context.lineTo(23, 5); context.lineTo(12, 8); context.closePath(); context.fill();
  context.fillStyle = "#2a2927";
  context.beginPath(); context.arc(5, -4, 2.6, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#f7ffff";
  context.beginPath(); context.arc(5.8, -4.8, 0.8, 0, Math.PI * 2); context.fill();
  context.restore();
}
