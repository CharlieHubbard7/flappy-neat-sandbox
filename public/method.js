const palette = { ink: "#28231f", muted: "#82776c", line: "#d1c5b9", blue: "#315f86", teal: "#4f8178", coral: "#c97763", gold: "#c6953e", paper: "#f2ece4" };

function setup(canvas) {
  const context = canvas.getContext("2d");
  context.lineCap = "round";
  context.lineJoin = "round";
  return context;
}

function label(context, text, x, y, align = "left") {
  context.fillStyle = palette.muted;
  context.font = "700 11px ui-rounded, system-ui, sans-serif";
  context.textAlign = align;
  context.fillText(text.toUpperCase(), x, y);
}

function rounded(context, x, y, width, height, radius, fill, stroke = palette.line) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = stroke;
  context.lineWidth = 1;
  context.stroke();
}

function arrow(context, from, to, color = palette.teal, width = 2) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(to.x, to.y);
  context.lineTo(to.x - 8 * Math.cos(angle - .42), to.y - 8 * Math.sin(angle - .42));
  context.lineTo(to.x - 8 * Math.cos(angle + .42), to.y - 8 * Math.sin(angle + .42));
  context.closePath(); context.fill();
}

function drawDecisionLoop() {
  const canvas = document.querySelector("#decision-loop"); const context = setup(canvas);
  const cards = [
    { x: 34, y: 106, w: 128, h: 116, title: "observations", body: ["velocity", "gate distance", "top / bottom"] },
    { x: 245, y: 106, w: 132, h: 116, title: "evolved network", body: ["weights", "hidden nodes", "flap output"] },
    { x: 458, y: 106, w: 128, h: 116, title: "environment", body: ["physics", "pipe course", "fitness"] },
  ];
  cards.forEach((card, index) => {
    rounded(context, card.x, card.y, card.w, card.h, 12, index === 1 ? "#e6efed" : "#f7f1e9");
    label(context, card.title, card.x + 16, card.y + 24);
    context.fillStyle = palette.ink; context.font = "600 14px ui-rounded, system-ui, sans-serif";
    card.body.forEach((line, row) => context.fillText(line, card.x + 16, card.y + 52 + row * 20));
  });
  arrow(context, { x: 164, y: 164 }, { x: 241, y: 164 });
  arrow(context, { x: 379, y: 164 }, { x: 454, y: 164 }, palette.blue);
  context.setLineDash([5, 6]); arrow(context, { x: 522, y: 228 }, { x: 98, y: 270 }, palette.coral, 1.5); context.setLineDash([]);
  label(context, "next frame", 309, 290, "center");
}

function drawFitnessModel() {
  const canvas = document.querySelector("#fitness-model"); const context = setup(canvas);
  const left = 62, right = 580, base = 254, top = 44;
  context.strokeStyle = palette.line; context.lineWidth = 1;
  [0, 1, 2, 3].forEach((mark) => { const y = base - mark * 55; context.beginPath(); context.moveTo(left, y); context.lineTo(right, y); context.stroke(); });
  context.strokeStyle = palette.muted; context.beginPath(); context.moveTo(left, top); context.lineTo(left, base); context.lineTo(right, base); context.stroke();
  label(context, "fitness", left, 28); label(context, "time alive", right, 289, "right");
  const points = [{ x: 70, y: 249 }, { x: 160, y: 237 }, { x: 250, y: 225 }, { x: 340, y: 212 }, { x: 430, y: 199 }, { x: 480, y: 83 }, { x: 570, y: 69 }];
  context.strokeStyle = palette.blue; context.lineWidth = 3; context.beginPath(); points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.stroke();
  points.forEach((point, index) => { context.fillStyle = index === 5 ? palette.gold : palette.blue; context.beginPath(); context.arc(point.x, point.y, index === 5 ? 7 : 3.5, 0, Math.PI * 2); context.fill(); });
  context.strokeStyle = palette.coral; context.lineWidth = 1.5; context.setLineDash([5, 5]); context.beginPath(); context.moveTo(340, 212); context.lineTo(370, 246); context.stroke(); context.setLineDash([]);
  context.fillStyle = palette.ink; context.font = "600 12px ui-rounded, system-ui, sans-serif"; context.fillText("pipe pass bonus", 402, 68); context.fillStyle = palette.muted; context.font = "500 11px ui-rounded, system-ui, sans-serif"; context.fillText("collision penalty", 376, 255); context.fillText("small survival reward", 155, 217);
}

function node(context, x, y, fill, text) {
  context.fillStyle = fill; context.beginPath(); context.arc(x, y, 11, 0, Math.PI * 2); context.fill();
  context.fillStyle = palette.muted; context.font = "700 10px ui-rounded, system-ui, sans-serif"; context.fillText(text, x + 17, y + 3);
}

function edge(context, from, to, color, width = 2) { arrow(context, from, to, color, width); }

function drawTopology() {
  const canvas = document.querySelector("#topology-growth"); const context = setup(canvas);
  const input = [{ x: 90, y: 82 }, { x: 90, y: 132 }, { x: 90, y: 182 }, { x: 90, y: 232 }];
  const hidden = { x: 325, y: 157 }, output = { x: 535, y: 157 };
  label(context, "starting sparse policy", 90, 42); label(context, "structural mutation", 360, 42);
  input.forEach((point, index) => edge(context, point, output, index % 2 ? palette.coral : palette.teal, 1.4));
  edge(context, input[0], hidden, palette.gold, 2.4); edge(context, input[2], hidden, palette.gold, 2.4); edge(context, hidden, output, palette.gold, 2.4);
  input.forEach((point, index) => node(context, point.x, point.y, "#a9c4bd", ["vy", "dx", "top", "bottom"][index]));
  node(context, hidden.x, hidden.y, palette.gold, "new h1"); node(context, output.x, output.y, palette.blue, "flap");
  context.fillStyle = palette.gold; context.font = "700 10px ui-rounded, system-ui, sans-serif"; context.fillText("new pathway", 340, 214);
}

drawDecisionLoop(); drawFitnessModel(); drawTopology();
