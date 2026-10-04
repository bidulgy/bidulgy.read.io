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

const art = {};
for (const [name, src] of Object.entries({
  background: "assets/judgment-hall.png",
  sans: "assets/sans-character.png",
  bone: "assets/bone.png",
  blaster: "assets/gaster-blaster.png"
})) {
  art[name] = new Image();
  art[name].src = src;
}

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

function bell(frequency = 1180, strength = 1) {
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  const now = audioContext.currentTime;
  const master = audioContext.createGain();
  master.gain.setValueAtTime(.0001, now);
  master.gain.exponentialRampToValueAtTime(.12 * strength, now + .004);
  master.gain.exponentialRampToValueAtTime(.0001, now + .58);
  master.connect(audioContext.destination);
  [1, 2.01, 3.96].forEach((ratio, index) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency * ratio, now);
    osc.frequency.exponentialRampToValueAtTime(frequency * ratio * .995, now + .5);
    gain.gain.setValueAtTime([1, .34, .12][index], now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + [.55, .32, .18][index]);
    osc.connect(gain).connect(master);
    osc.start(now); osc.stop(now + .6);
  });
}

function blasterCharge() {
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  const now = audioContext.currentTime;
  const master = audioContext.createGain();
  master.gain.setValueAtTime(.0001, now);
  master.gain.exponentialRampToValueAtTime(.045, now + .05);
  master.gain.exponentialRampToValueAtTime(.0001, now + .68);
  master.connect(audioContext.destination);
  [["sawtooth", 105, 920, .56], ["square", 58, 460, .28]].forEach(([type, from, to, level]) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + .62);
    gain.gain.setValueAtTime(level, now);
    osc.connect(gain).connect(master);
    osc.start(now); osc.stop(now + .7);
  });
}

function blasterFire() {
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(190, now);
  osc.frequency.exponentialRampToValueAtTime(42, now + .24);
  gain.gain.setValueAtTime(.07, now);
  gain.gain.exponentialRampToValueAtTime(.0001, now + .26);
  osc.connect(gain).connect(audioContext.destination);
  osc.start(now); osc.stop(now + .27);
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
  return type === "orb" ? "#55dfff" : type === "cross" ? "#ffffff" : type === "arrow" ? "#ffd84d" : "#ffffff";
}

function spawnNote(data) {
  const angle = ((data.x || 0) / 820) * Math.PI * 2 - Math.PI / 2;
  notes.push({ time: data.time, type: data.type, angle, color: noteColor(data.type), judged: false });
  if (data.type === "orb") blasterCharge();
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
  if (perfect) burst(candidate.angle + Math.PI, "#ffffff", 14);
  rings.push({ life: 1, color: candidate.color, strength: perfect ? 1 : .65 });
  if (perfect) rings.push({ life: 1.15, color: "#ffffff", strength: 1.35 });
  shake = perfect ? 11 : 6;
  flash = perfect ? .32 : .16;
  showJudge(perfect ? "PERFECT" : "SYNC", candidate.color);
  bell(perfect ? 1320 : 940, perfect ? 1 : .68);
  if (perfect) setTimeout(() => bell(1980, .38), 42);
  if (candidate.type === "orb") blasterFire();
  if (overdrive >= 100 && performance.now() >= overdriveUntil) activateOverdrive();
  updateHud();
}

function activateOverdrive() {
  overdriveUntil = performance.now() + 6000;
  overdrive = 100;
  ui.overdrive.classList.add("live");
  showJudge("OVERDRIVE", "#ffe45c");
  rings.push({ life: 1.5, color: "#ffe45c", strength: 2 });
  bell(660, 1);
  setTimeout(() => bell(990, .8), 90);
  setTimeout(() => bell(1320, .65), 180);
}

function miss(note) {
  note.judged = true;
  chain = 0;
  sync = Math.max(0, sync - 7);
  overdrive = Math.max(0, overdrive - 10);
  shake = 15; flash = .22;
  showJudge("BREAK", "#ff3f62");
  tone(75, .16, "sawtooth", .04);
  if (note.type === "orb") blasterFire();
  updateHud();
  if (!sync) finish(false);
}

function burst(angle, color, count) {
  for (let i = 0; i < count; i++) {
    const a = angle + (Math.random() - .5) * 1.5;
    const speed = 80 + Math.random() * 260;
    particles.push({ x: 0, y: 0, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .45 + Math.random() * .45, color, size: 2 + Math.random() * 5, angle: a });
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
  if (art.background.complete) {
    const imageRatio = art.background.width / art.background.height;
    const viewRatio = w / h;
    let sw = art.background.width, sh = art.background.height, sx = 0, sy = 0;
    if (imageRatio > viewRatio) { sw = art.background.height * viewRatio; sx = (art.background.width - sw) / 2; }
    else { sh = art.background.width / viewRatio; sy = (art.background.height - sh) / 2; }
    ctx.drawImage(art.background, sx, sy, sw, sh, 0, 0, w, h);
  } else {
    ctx.fillStyle = "#100b13"; ctx.fillRect(0, 0, w, h);
  }
  ctx.fillStyle = now < overdriveUntil ? "rgba(44,26,0,.2)" : "rgba(0,0,0,.34)";
  ctx.fillRect(0, 0, w, h);
}

function drawCore(cx, cy, now) {
  const beat = state === "playing" ? 1 + Math.max(0, 1 - Math.abs((audio.currentTime * 2) % 1 - .5) * 5) * .08 : 1;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(beat, beat);
  ctx.shadowBlur = 24; ctx.shadowColor = "#ff2638";
  ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 0, 58, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#ff2638";
  ctx.beginPath();
  ctx.moveTo(0, 22); ctx.bezierCurveTo(-8, 10, -30, -4, -30, -19); ctx.bezierCurveTo(-30, -35, -9, -38, 0, -22); ctx.bezierCurveTo(9, -38, 30, -35, 30, -19); ctx.bezierCurveTo(30, -4, 8, 10, 0, 22); ctx.fill();
  ctx.restore();
}

function drawBoss(w, h, now) {
  if (!art.sans.complete) return;
  const height = Math.min(190, h * .35);
  const width = height * (art.sans.width / art.sans.height);
  const bob = Math.sin(now / 330) * 2;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.shadowBlur = now < overdriveUntil ? 22 : 10;
  ctx.shadowColor = now < overdriveUntil ? "#ffd84d" : "rgba(0,0,0,.8)";
  ctx.drawImage(art.sans, w / 2 - width / 2, h * .045 + bob, width, height);
  ctx.restore();
}

function drawBoneProjectile(width, height) {
  const bodyWidth = width * .48;
  const endY = height * .36;
  ctx.fillStyle = "#050505";
  ctx.beginPath(); ctx.roundRect(-bodyWidth / 2 - 3, -endY, bodyWidth + 6, endY * 2, 6); ctx.fill();
  for (const y of [-endY, endY]) {
    for (const x of [-width * .22, width * .22]) {
      ctx.beginPath(); ctx.arc(x, y, width * .22 + 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.roundRect(-bodyWidth / 2, -endY, bodyWidth, endY * 2, 4); ctx.fill();
  for (const y of [-endY, endY]) {
    for (const x of [-width * .22, width * .22]) {
      ctx.beginPath(); ctx.arc(x, y, width * .22, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = "#cfd1d4";
  ctx.fillRect(-bodyWidth * .28, -endY + 5, Math.max(3, bodyWidth * .18), endY * 2 - 10);
}

function drawNotes(cx, cy, w, h, time) {
  const outer = Math.min(w, h) * .46;
  const hitRadius = 62;
  for (const note of notes) {
    if (note.judged) continue;
    const remaining = note.time - time;
    const t = Math.max(0, Math.min(1, 1 - remaining / 1.15));
    const radius = outer + (hitRadius - outer) * t;
    const orbFiring = note.type === "orb" && t > .68;
    const orbCharge = orbFiring ? Math.min(1, (t - .68) / .32) : 0;
    const recoil = orbFiring ? Math.sin(orbCharge * Math.PI / 2) * 30 : 0;
    const visualRadius = note.type === "orb" ? outer * .78 + recoil : radius;
    const x = cx + Math.cos(note.angle) * visualRadius;
    const y = cy + Math.sin(note.angle) * visualRadius;
    if (note.type === "cross") {
      for (const angleOffset of [0, Math.PI / 2]) {
        const attackAngle = note.angle + angleOffset;
        const boneX = cx + Math.cos(attackAngle) * radius;
        const boneY = cy + Math.sin(attackAngle) * radius;
        ctx.save();
        ctx.translate(boneX, boneY);
        ctx.rotate(attackAngle + Math.PI / 2);
        ctx.imageSmoothingEnabled = false;
        ctx.shadowBlur = 16;
        ctx.shadowColor = note.color;
        drawBoneProjectile(40, 82);
        ctx.restore();
      }
      continue;
    }
    if (note.type === "orb") {
      const firing = orbFiring;
      const charge = orbCharge;
      const size = 92 + t * 32;
      const towardX = Math.cos(note.angle + Math.PI);
      const towardY = Math.sin(note.angle + Math.PI);
      const mouthX = x + towardX * size * .53;
      const mouthY = y + towardY * size * .53;
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = firing ? `rgba(85,223,255,${.45 + charge * .45})` : "rgba(85,223,255,.3)";
      ctx.lineWidth = firing ? 32 + charge * 34 : 3;
      ctx.shadowBlur = firing ? 28 : 10;
      ctx.shadowColor = "#55dfff";
      ctx.beginPath(); ctx.moveTo(mouthX, mouthY); ctx.lineTo(cx, cy); ctx.stroke();
      if (firing) {
        ctx.strokeStyle = `rgba(255,255,255,${.72 + charge * .28})`;
        ctx.lineWidth = 12 + charge * 18;
        ctx.shadowBlur = 16; ctx.shadowColor = "#fff";
        ctx.beginPath(); ctx.moveTo(mouthX, mouthY); ctx.lineTo(cx, cy); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(note.type === "orb" ? note.angle + Math.PI : note.angle + Math.PI / 2);
    ctx.imageSmoothingEnabled = false; ctx.shadowBlur = 16; ctx.shadowColor = note.color;
    if (note.type === "orb" && art.blaster.complete) {
      const size = 92 + t * 32;
      ctx.drawImage(art.blaster, -size * .68, -size * .38, size * 1.36, size * .76);
    } else {
      const bh = 74;
      const bw = 36;
      drawBoneProjectile(bw, bh);
      if (note.type === "arrow") {
        ctx.save(); ctx.translate(42, 0); drawBoneProjectile(32, 68); ctx.restore();
        ctx.save(); ctx.translate(-42, 0); drawBoneProjectile(32, 68); ctx.restore();
      }
    }
    ctx.restore();
  }
}

function updateAndDrawEffects(cx, cy, dt) {
  particles = particles.filter(p => {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life <= 0) return false;
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.translate(cx + p.x, cy + p.y); ctx.rotate(p.angle);
    ctx.fillStyle = p.color; ctx.shadowBlur = 12; ctx.shadowColor = p.color;
    ctx.fillRect(-p.size * 2.8, -p.size / 2, p.size * 5.6, p.size);
    ctx.restore();
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
