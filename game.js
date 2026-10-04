const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ui = {
  time: document.getElementById("time"), progress: document.getElementById("progress"),
  boss: document.getElementById("bossHp"), life: document.getElementById("life"),
  combo: document.querySelector("#combo b"), overdrive: document.getElementById("overdrive"),
  overdriveFill: document.getElementById("overdriveFill"), judge: document.getElementById("judge"),
  startPanel: document.getElementById("startPanel"), result: document.getElementById("resultPanel"),
  resultTitle: document.getElementById("resultTitle"), resultText: document.getElementById("resultText")
};

let audio;
let audioContext;
let chart = [];
let notes = [];
let particles = [];
let rings = [];
let state = "idle";
let chartIndex = 0;
let sync = 100;
let boss = 100;
let chain = 0;
let bestChain = 0;
let overdrive = 0;
let overdriveUntil = 0;
let shake = 0;
let flash = 0;
let lastFrame = performance.now();

fetch("chart.json").then(r => r.json()).then(data => { chart = data; });

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener("resize", resize);
resize();

function tone(freq, duration, wave = "square", volume = .025, slide = 0) {
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, now);
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  osc.connect(gain).connect(audioContext.destination);
  osc.start(now); osc.stop(now + duration);
}

function reset() {
  notes = []; particles = []; rings = []; chartIndex = 0;
  sync = 100; boss = 100; chain = 0; bestChain = 0; overdrive = 0; overdriveUntil = 0;
  updateHud();
}

function start() {
  document.activeElement?.blur();
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  audioContext.resume();
  if (!audio) {
    audio = new Audio("assets/sans.mp3");
    audio.volume = .78;
    audio.addEventListener("ended", () => finish(true));
  }
  audio.pause(); audio.currentTime = 0; reset();
  ui.startPanel.style.display = "none";
  ui.result.classList.remove("show");
  state = "countdown";
  let count = 3;
  showJudge(String(count), "#fff");
  const timer = setInterval(() => {
    count--;
    if (count > 0) { showJudge(String(count), "#fff"); tone(330, .05); }
    else {
      clearInterval(timer);
      showJudge("BREAK!", "#35f2ff");
      tone(660, .09, "square", .035, 1320);
      state = "playing";
      audio.play().catch(() => {});
    }
  }, 650);
}

function noteColor(type) {
  return type === "orb" ? "#35f2ff" : type === "cross" ? "#ff3f9b" : type === "arrow" ? "#ffe45c" : "#9b70ff";
}

function spawnNote(data) {
  const angle = ((data.x || 0) / 820) * Math.PI * 2 - Math.PI / 2;
  notes.push({ time: data.time, type: data.type, angle, color: noteColor(data.type), judged: false });
}

function pulse(event) {
  event?.preventDefault();
  document.activeElement?.blur();
  if (state !== "playing") return;
  const time = audio.currentTime;
  let candidate = null;
  let distance = Infinity;
  for (const note of notes) {
    if (note.judged) continue;
    const d = Math.abs(note.time - time);
    if (d < distance) { distance = d; candidate = note; }
  }
  if (!candidate || distance > .19) {
    chain = 0;
    overdrive = Math.max(0, overdrive - 5);
    tone(120, .045, "square", .012);
    updateHud();
    return;
  }
  candidate.judged = true;
  const perfect = distance <= .085;
  const power = perfect ? 1 : .62;
  chain++;
  bestChain = Math.max(bestChain, chain);
  overdrive = Math.min(100, overdrive + (perfect ? 7 : 4));
  boss = Math.max(0, boss - power * (performance.now() < overdriveUntil ? 2.2 : 1));
  burst(candidate.angle, candidate.color, perfect ? 28 : 16);
  rings.push({ life: 1, color: candidate.color, strength: perfect ? 1 : .65 });
  shake = perfect ? 11 : 6;
  flash = perfect ? .32 : .16;
  showJudge(perfect ? "PERFECT" : "SYNC", candidate.color);
  tone(perfect ? 980 : 720, .07, "square", .035, perfect ? 1760 : 1100);
  if (overdrive >= 100 && performance.now() >= overdriveUntil) activateOverdrive();
  updateHud();
}

function activateOverdrive() {
  overdriveUntil = performance.now() + 6000;
  overdrive = 100;
  ui.overdrive.classList.add("live");
  showJudge("OVERDRIVE", "#ffe45c");
  rings.push({ life: 1.5, color: "#ffe45c", strength: 2 });
  tone(260, .35, "sawtooth", .04, 1560);
}

function miss(note) {
  note.judged = true;
  chain = 0;
  sync = Math.max(0, sync - 7);
  overdrive = Math.max(0, overdrive - 10);
  shake = 15; flash = .22;
  showJudge("BREAK", "#ff3f62");
  tone(75, .16, "sawtooth", .04);
  updateHud();
  if (!sync) finish(false);
}

function burst(angle, color, count) {
  for (let i = 0; i < count; i++) {
    const a = angle + (Math.random() - .5) * 1.5;
    const speed = 80 + Math.random() * 260;
    particles.push({ x: 0, y: 0, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .45 + Math.random() * .45, color, size: 2 + Math.random() * 5 });
  }
}

function showJudge(text, color) {
  ui.judge.textContent = text;
  ui.judge.style.color = color;
  ui.judge.classList.remove("show");
  void ui.judge.offsetWidth;
  ui.judge.classList.add("show");
}

function updateHud() {
  ui.combo.textContent = chain;
  ui.life.style.width = `${sync}%`;
  ui.boss.style.width = `${boss}%`;
  ui.overdriveFill.style.width = `${overdrive}%`;
}

function finish(won) {
  if (state !== "playing") return;
  state = won ? "clear" : "failed";
  audio.pause();
  ui.resultTitle.textContent = won ? "COMPLETE" : "SYNC LOST";
  ui.resultText.textContent = won ? `최고 체인 ${bestChain} · 코어 파괴 ${Math.round(100 - boss)}%` : `최고 체인 ${bestChain}`;
  ui.result.classList.add("show");
  if (won) { tone(660, .18, "square", .035); setTimeout(() => tone(990, .3, "square", .035), 160); }
}

function drawBackground(w, h, now) {
  const live = now < overdriveUntil;
  const gradient = ctx.createRadialGradient(w / 2, h * .54, 20, w / 2, h * .54, Math.max(w, h) * .65);
  gradient.addColorStop(0, live ? "#342300" : "#10152c");
  gradient.addColorStop(1, "#05050a");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = live ? "rgba(255,228,92,.18)" : "rgba(53,242,255,.1)";
  ctx.lineWidth = 1;
  for (let r = 100; r < Math.max(w, h); r += 56) {
    ctx.beginPath(); ctx.arc(w / 2, h * .54, r + Math.sin(now / 300 + r) * 3, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawCore(cx, cy, now) {
  const beat = state === "playing" ? 1 + Math.max(0, 1 - Math.abs((audio.currentTime * 2) % 1 - .5) * 5) * .08 : 1;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(beat, beat);
  ctx.shadowBlur = 28; ctx.shadowColor = "#35f2ff";
  ctx.strokeStyle = "#35f2ff"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(0, 0, 58, 0, Math.PI * 2); ctx.stroke();
  ctx.rotate(now / 900);
  ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.strokeRect(45, -7, 18, 14); }
  ctx.restore();
}

function drawBoss(w, h, now) {
  const x = w / 2, y = h * .17;
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(now / 700) * .03);
  ctx.shadowBlur = 24; ctx.shadowColor = "#ff3f9b";
  ctx.strokeStyle = "#ff3f9b"; ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 48 : 68;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.stroke();
  ctx.fillStyle = "#ff3f9b"; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawNotes(cx, cy, w, h, time) {
  const outer = Math.min(w, h) * .46;
  const hitRadius = 62;
  for (const note of notes) {
    if (note.judged) continue;
    const remaining = note.time - time;
    const t = Math.max(0, Math.min(1, 1 - remaining / 1.15));
    const radius = outer + (hitRadius - outer) * t;
    const x = cx + Math.cos(note.angle) * radius;
    const y = cy + Math.sin(note.angle) * radius;
    ctx.save(); ctx.translate(x, y); ctx.rotate(note.angle + Math.PI / 2);
    ctx.shadowBlur = 18; ctx.shadowColor = note.color; ctx.fillStyle = note.color;
    if (note.type === "cross") { ctx.fillRect(-5, -17, 10, 34); ctx.fillRect(-17, -5, 34, 10); }
    else if (note.type === "arrow") { ctx.beginPath(); ctx.moveTo(0, 17); ctx.lineTo(-14, -9); ctx.lineTo(-5, -6); ctx.lineTo(0, -18); ctx.lineTo(5, -6); ctx.lineTo(14, -9); ctx.closePath(); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(0, 0, note.type === "orb" ? 13 : 11, 0, Math.PI * 2); ctx.fill(); if (note.type !== "orb") { ctx.rotate(Math.PI / 4); ctx.fillRect(-10, -10, 20, 20); } }
    ctx.restore();
  }
}

function updateAndDrawEffects(cx, cy, dt) {
  particles = particles.filter(p => {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life <= 0) return false;
    ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.color; ctx.fillRect(cx + p.x, cy + p.y, p.size, p.size); ctx.globalAlpha = 1;
    return true;
  });
  rings = rings.filter(r => {
    r.life -= dt * 1.8; if (r.life <= 0) return false;
    ctx.globalAlpha = Math.min(1, r.life); ctx.strokeStyle = r.color; ctx.lineWidth = 4 * r.strength;
    ctx.beginPath(); ctx.arc(cx, cy, 65 + (1 - Math.min(1, r.life)) * 170 * r.strength, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    return true;
  });
}

function loop(now) {
  const dt = Math.min(.033, (now - lastFrame) / 1000); lastFrame = now;
  const rect = canvas.getBoundingClientRect(), w = rect.width, h = rect.height;
  if (state === "playing") {
    while (chartIndex < chart.length && chart[chartIndex].time - audio.currentTime <= 1.15) spawnNote(chart[chartIndex++]);
    for (const note of notes) if (!note.judged && audio.currentTime - note.time > .19) miss(note);
    notes = notes.filter(note => !note.judged || audio.currentTime - note.time < .5);
    const duration = audio.duration || 156;
    ui.time.textContent = `${Math.floor(audio.currentTime / 60)}:${String(Math.floor(audio.currentTime % 60)).padStart(2,"0")}`;
    ui.progress.style.width = `${audio.currentTime / duration * 100}%`;
    if (overdriveUntil && now >= overdriveUntil) { overdriveUntil = 0; overdrive = 0; ui.overdrive.classList.remove("live"); updateHud(); }
  }
  ctx.save();
  if (shake > .2) { ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); shake *= .82; }
  drawBackground(w, h, now); drawBoss(w, h, now);
  const cx = w / 2, cy = h * .58;
  drawCore(cx, cy, now);
  if (state === "playing") drawNotes(cx, cy, w, h, audio.currentTime);
  updateAndDrawEffects(cx, cy, dt);
  if (flash > .01) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, w, h); flash *= .72; }
  ctx.restore();
  requestAnimationFrame(loop);
}

document.getElementById("start").addEventListener("pointerdown", event => { event.preventDefault(); start(); });
document.getElementById("retry").addEventListener("pointerdown", event => { event.preventDefault(); start(); });
document.getElementById("pulse").addEventListener("pointerdown", pulse);
canvas.addEventListener("pointerdown", pulse);
addEventListener("keydown", event => { if (!event.repeat && state === "playing") pulse(event); });
requestAnimationFrame(loop);
