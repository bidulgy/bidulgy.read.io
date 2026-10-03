const MAX_HP = 20;
const GUARD_MS = 320;
const EMPTY_GUARD_LOCK_MS = 1000;
const TELEGRAPH_SECONDS = 0.72;
const LATE_GUARD_GRACE_MS = 90;

const els = {
  stage: document.getElementById("stage"), box: document.getElementById("soulBox"),
  attacks: document.getElementById("attackLayer"), timing: document.getElementById("timing"),
  flash: document.getElementById("beatFlash"), hp: document.getElementById("hp"),
  time: document.getElementById("time"), status: document.getElementById("status"),
  speech: document.getElementById("speech"), speechText: document.getElementById("speechText"),
  clear: document.getElementById("clearScreen"), start: document.getElementById("start"),
  defend: document.getElementById("defend")
};

let audio;
let audioContext;
let chart = [];
let state = "idle";
let hp = MAX_HP;
let chartIndex = 0;
let attacks = [];
let guardUntil = 0;
let guardBlocked = false;
let lockUntil = 0;

fetch("chart.json").then(response => response.json()).then(data => { chart = data; }).catch(() => { chart = []; });

function tone(frequency, duration = .06, type = "square", volume = .035, delay = 0) {
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const startAt = audioContext.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(volume, startAt);
  gain.gain.exponentialRampToValueAtTime(.0001, startAt + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration);
}

function playGuardSound(kind) {
  if (kind === "press") tone(760, .045, "square", .022);
  if (kind === "block") { tone(1040, .08, "square", .04); tone(1560, .09, "square", .025, .025); }
  if (kind === "locked") tone(130, .11, "sawtooth", .025);
  if (kind === "hurt") tone(85, .16, "square", .045);
}

function clearAttacks() {
  attacks.forEach(attack => attack.elements.forEach(element => element.remove()));
  attacks = [];
}

function resetBattle() {
  clearAttacks();
  hp = MAX_HP;
  chartIndex = 0;
  guardUntil = lockUntil = 0;
  els.hp.textContent = hp;
  els.time.textContent = "0:00 / 2:36";
  els.timing.textContent = "READY";
  els.clear.classList.remove("show");
}

function typeSpeech(text, index = 0) {
  els.speechText.textContent = text.slice(0, index);
  if (index <= text.length) {
    if (index) tone(210 + index * 7, .025, "square", .012);
    setTimeout(() => typeSpeech(text, index + 1), 95);
  }
}

function start() {
  if (state === "dialogue" || state === "playing") return;
  document.activeElement?.blur();
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  audioContext.resume();
  if (!audio) {
    audio = new Audio("assets/sans.mp3");
    audio.volume = .72;
    audio.addEventListener("ended", clearBattle);
  }
  resetBattle();
  audio.pause();
  audio.currentTime = 0;
  state = "dialogue";
  els.speech.classList.add("show");
  typeSpeech("준비됐어?");
  els.status.textContent = "샌즈가 공격을 준비하고 있습니다.";
  setTimeout(beginMusic, 1900);
}

function beginMusic() {
  if (state !== "dialogue") return;
  els.speech.classList.remove("show");
  state = "playing";
  els.timing.textContent = "";
  els.status.textContent = "공격이 닿는 순간 아무 키나 누르세요.";
  audio.play().catch(() => {});
  spawnOpeningAttack();
}

function defend(event) {
  event?.preventDefault();
  document.activeElement?.blur();
  if (state !== "playing") return;
  const now = performance.now();
  if (now < lockUntil) { playGuardSound("locked"); return; }
  if (now < guardUntil) return;
  guardUntil = now + GUARD_MS;
  guardBlocked = false;
  playGuardSound("press");
}

function finishGuard(now) {
  if (!guardUntil || now < guardUntil) return;
  guardUntil = 0;
  if (!guardBlocked) lockUntil = now + EMPTY_GUARD_LOCK_MS;
}

function makeBone(horizontal = false) {
  const bone = document.createElement("img");
  bone.src = "assets/bone.png";
  bone.alt = "";
  bone.className = `bone${horizontal ? " horizontal" : ""}`;
  els.box.appendChild(bone);
  return bone;
}

function makeBlaster() {
  const blaster = document.createElement("img");
  blaster.src = "assets/gaster-blaster.png";
  blaster.alt = "";
  blaster.className = "blaster";
  els.box.appendChild(blaster);
  return blaster;
}

function makeBeam(horizontal) {
  const beam = document.createElement("div");
  beam.className = "beam";
  beam.style.cssText = horizontal ? "left:0;top:calc(50% - 9px);width:100%;height:18px" : "top:0;left:calc(50% - 9px);width:18px;height:100%";
  els.box.appendChild(beam);
  return beam;
}

function spawnPattern(note, impactTime) {
  const box = els.box.getBoundingClientRect();
  const center = { x: box.width / 2, y: box.height / 2 };
  const elements = [];
  const tracks = [];
  const pattern = note.type || "diamond";

  if (pattern === "orb") {
    const horizontal = Math.floor(note.time) % 2 === 0;
    const beam = makeBeam(horizontal);
    const blaster = makeBlaster();
    blaster.style.left = horizontal ? `${box.width - 42}px` : `${center.x}px`;
    blaster.style.top = horizontal ? `${center.y}px` : "30px";
    blaster.style.transform = horizontal ? "translate(-50%,-50%) rotate(180deg)" : "translate(-50%,-50%) rotate(90deg)";
    elements.push(beam, blaster);
  } else {
    const count = pattern === "cross" ? 4 : pattern === "arrow" ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const horizontal = (i + attackSerial) % 2 === 0;
      const bone = makeBone(horizontal);
      const side = (i + attackSerial) % 4;
      const spread = (i - (count - 1) / 2) * 28;
      const start = side === 0 ? { x: -35, y: center.y + spread } : side === 1 ? { x: center.x + spread, y: -45 } : side === 2 ? { x: box.width + 35, y: center.y + spread } : { x: center.x + spread, y: box.height + 45 };
      tracks.push({ element: bone, start, end: { x: center.x + spread * .18, y: center.y + spread * .18 } });
      elements.push(bone);
    }
  }
  attackSerial++;
  attacks.push({ elements, tracks, bornAt: performance.now(), impactAt: impactTime, resolved: false, pattern });
}

let attackSerial = 0;
function spawnOpeningAttack() {
  spawnPattern({ type: "cross", time: 0 }, performance.now() + 720);
}

function resolveAttack(attack, now) {
  if (attack.resolved) return;
  attack.resolved = true;
  attack.elements.forEach(element => { if (element.classList.contains("beam")) element.classList.add("fire"); });
  if (now < guardUntil) {
    guardBlocked = true;
    guardUntil = 0;
    playGuardSound("block");
    els.timing.textContent = "BLOCK";
  } else {
    hp = Math.max(0, hp - (attack.pattern === "orb" ? 4 : 2));
    els.hp.textContent = hp;
    playGuardSound("hurt");
    els.timing.textContent = "HIT";
    els.stage.classList.remove("hit");
    void els.stage.offsetWidth;
    els.stage.classList.add("hit");
    if (!hp) gameOver();
  }
  setTimeout(() => { if (state === "playing") els.timing.textContent = ""; }, 180);
}

function updateAttacks(now) {
  attacks.forEach(attack => {
    const travel = Math.max(1, attack.impactAt - attack.bornAt);
    const progress = Math.max(0, Math.min(1, (now - attack.bornAt) / travel));
    attack.tracks.forEach(track => {
      track.element.style.left = `${track.start.x + (track.end.x - track.start.x) * progress}px`;
      track.element.style.top = `${track.start.y + (track.end.y - track.start.y) * progress}px`;
    });
    if (now >= attack.impactAt + LATE_GUARD_GRACE_MS) resolveAttack(attack, now);
  });
  attacks = attacks.filter(attack => {
    if (now < attack.impactAt + 150) return true;
    attack.elements.forEach(element => element.remove());
    return false;
  });
}

function scheduleChart(now) {
  while (chartIndex < chart.length && chart[chartIndex].time - TELEGRAPH_SECONDS <= audio.currentTime) {
    const note = chart[chartIndex++];
    const secondsUntilImpact = Math.max(.08, note.time - audio.currentTime);
    spawnPattern(note, now + secondsUntilImpact * 1000);
  }
}

function clearBattle() {
  if (state !== "playing") return;
  state = "clear";
  clearAttacks();
  els.clear.classList.add("show");
  els.status.textContent = "모든 패턴을 버티고 곡을 끝냈습니다.";
  tone(660, .16, "square", .035);
  tone(880, .2, "square", .035, .16);
  tone(1320, .35, "square", .035, .34);
}

function gameOver() {
  state = "gameover";
  audio.pause();
  clearAttacks();
  els.timing.textContent = "GAME OVER";
  els.status.textContent = "전투 시작을 눌러 다시 도전하세요.";
}

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function loop(now) {
  finishGuard(now);
  if (state === "playing") {
    scheduleChart(now);
    updateAttacks(now);
    els.time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration || 156)}`;
  }
  requestAnimationFrame(loop);
}

els.start.addEventListener("pointerdown", event => { event.preventDefault(); start(); });
els.defend.addEventListener("pointerdown", defend);
addEventListener("keydown", event => {
  if (event.repeat) { event.preventDefault(); return; }
  if (state === "idle" && event.key === "Enter") { event.preventDefault(); start(); return; }
  if (state === "playing") defend(event);
});
resetBattle();
requestAnimationFrame(loop);
