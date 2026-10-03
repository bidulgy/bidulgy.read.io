const MAX_HP = 20;
const DEFENSE_MS = 190;
const EMPTY_DEFENSE_COOLDOWN_MS = 1000;
const MOVE_SPEED = 230;

const els = {
  stage: document.getElementById("stage"), enemy: document.getElementById("enemyArea"),
  box: document.getElementById("soulBox"), soul: document.getElementById("soul"),
  shield: document.getElementById("shield"), attacks: document.getElementById("attackLayer"),
  timing: document.getElementById("timing"), flash: document.getElementById("beatFlash"),
  hp: document.getElementById("hp"), score: document.getElementById("score"),
  combo: document.getElementById("combo"), status: document.getElementById("status"),
  defenseState: document.getElementById("defenseState"), cooldown: document.getElementById("cooldownFill")
};

let audio;
let playing = false;
let hp = MAX_HP;
let score = 0;
let combo = 0;
let soul = { x: 0.5, y: 0.5 };
let attacks = [];
let keys = new Set();
let lastFrame = performance.now();
let nextAttackAt = 0;
let attackCount = 0;
let defenseUntil = 0;
let cooldownUntil = 0;
let defenseBlocked = false;

function resetBattle() {
  attacks.forEach(attack => { attack.el.remove(); attack.blaster?.remove(); });
  attacks = [];
  hp = MAX_HP; score = 0; combo = 0; attackCount = 0;
  soul = { x: 0.5, y: 0.5 };
  cooldownUntil = defenseUntil = 0;
  els.shield.className = "";
  updateHud();
}

function start() {
  if (!audio) {
    audio = new Audio("assets/sans.mp3");
    audio.loop = true;
    audio.volume = 0.7;
  }
  resetBattle();
  audio.currentTime = 0;
  audio.play().catch(() => {});
  playing = true;
  nextAttackAt = performance.now() + 850;
  els.timing.textContent = "READY";
  els.status.textContent = "공격을 보고 방어하세요.";
}

function defend() {
  const now = performance.now();
  if (!playing || now < cooldownUntil || now < defenseUntil) return;
  defenseUntil = now + DEFENSE_MS;
  defenseBlocked = false;
  els.shield.classList.add("active");
  els.defenseState.textContent = "GUARD";
}

function finishDefense(now) {
  if (!defenseUntil || now < defenseUntil) return;
  defenseUntil = 0;
  els.shield.classList.remove("active");
  if (!defenseBlocked) {
    cooldownUntil = now + EMPTY_DEFENSE_COOLDOWN_MS;
    els.shield.classList.add("cooldown");
    els.defenseState.textContent = "LOCK";
    els.status.textContent = "헛방어! 1초 동안 방어할 수 없습니다.";
  } else {
    els.defenseState.textContent = "READY";
  }
}

function spawnBone() {
  const box = els.box.getBoundingClientRect();
  const fromLeft = attackCount % 2 === 0;
  const el = document.createElement("div");
  el.className = "bone";
  els.box.appendChild(el);
  const y = 18 + Math.random() * Math.max(20, box.height - 100);
  attacks.push({ type: "bone", el, x: fromLeft ? -28 : box.width + 28, y, vx: fromLeft ? 255 : -255, w: 20, h: 78, hit: false });
}

function spawnBlaster() {
  const box = els.box.getBoundingClientRect();
  const horizontal = attackCount % 8 === 4;
  const lane = horizontal ? soul.y * box.height : soul.x * box.width;
  const blaster = document.createElement("div");
  blaster.className = "blaster";
  els.attacks.appendChild(blaster);
  const beam = document.createElement("div");
  beam.className = "beam warning";
  els.box.appendChild(beam);
  if (horizontal) {
    blaster.style.cssText = "right:18px;bottom:2px;transform:rotate(-90deg) scale(.65)";
    beam.style.cssText = `left:0;top:${lane - 9}px;width:100%;height:18px`;
  } else {
    const left = Math.max(0, Math.min(els.enemy.clientWidth - 78, lane + (els.enemy.clientWidth - box.width) / 2 - 39));
    blaster.style.cssText = `left:${left}px;bottom:2px`;
    beam.style.cssText = `top:0;left:${lane - 9}px;width:18px;height:100%`;
  }
  requestAnimationFrame(() => blaster.classList.add("show"));
  const now = performance.now();
  attacks.push({ type: "beam", el: beam, blaster, horizontal, lane, fireAt: now + 520, endAt: now + 820, hit: false });
}

function spawnAttack(now) {
  attackCount++;
  if (attackCount % 4 === 0) spawnBlaster(); else spawnBone();
  nextAttackAt = now + Math.max(470, 830 - attackCount * 3);
  els.flash.style.opacity = ".12";
  setTimeout(() => els.flash.style.opacity = "0", 65);
}

function soulRect(box) {
  return { x: soul.x * box.width - 10, y: soul.y * box.height - 10, w: 20, h: 20 };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function resolveHit(attack, now) {
  if (attack.hit) return;
  attack.hit = true;
  if (now < defenseUntil) {
    defenseBlocked = true;
    score += attack.type === "beam" ? 200 : 100;
    combo++;
    els.timing.textContent = "BLOCK";
    els.status.textContent = "방어 성공!";
    attack.el.remove();
    attack.blaster?.remove();
  } else {
    hp = Math.max(0, hp - (attack.type === "beam" ? 4 : 2));
    combo = 0;
    els.timing.textContent = "HIT";
    els.stage.classList.remove("hit");
    void els.stage.offsetWidth;
    els.stage.classList.add("hit");
    if (hp === 0) gameOver();
  }
  updateHud();
  setTimeout(() => { if (els.timing.textContent !== "GAME OVER") els.timing.textContent = ""; }, 260);
}

function updateAttacks(dt, now) {
  const box = els.box.getBoundingClientRect();
  const player = soulRect(box);
  attacks = attacks.filter(attack => {
    if (!attack.el.isConnected) return false;
    if (attack.type === "bone") {
      attack.x += attack.vx * dt;
      attack.el.style.left = `${attack.x}px`;
      attack.el.style.top = `${attack.y}px`;
      if (overlaps(player, { x: attack.x, y: attack.y, w: attack.w, h: attack.h })) resolveHit(attack, now);
      if (attack.x < -90 || attack.x > box.width + 90 || attack.hit) { attack.el.remove(); return false; }
    } else {
      if (now >= attack.fireAt) {
        attack.el.classList.remove("warning");
        attack.el.classList.add("fire");
        const struck = attack.horizontal ? Math.abs(soul.y * box.height - attack.lane) < 22 : Math.abs(soul.x * box.width - attack.lane) < 22;
        if (struck) resolveHit(attack, now);
      }
      if (now >= attack.endAt || attack.hit) { attack.el.remove(); attack.blaster.remove(); return false; }
    }
    return true;
  });
}

function updateSoul(dt) {
  let dx = 0, dy = 0;
  if (keys.has("arrowleft") || keys.has("a")) dx--;
  if (keys.has("arrowright") || keys.has("d")) dx++;
  if (keys.has("arrowup") || keys.has("w")) dy--;
  if (keys.has("arrowdown") || keys.has("s")) dy++;
  const box = els.box.getBoundingClientRect();
  if (dx && dy) { dx *= .707; dy *= .707; }
  soul.x = Math.max(.04, Math.min(.96, soul.x + dx * MOVE_SPEED * dt / box.width));
  soul.y = Math.max(.07, Math.min(.93, soul.y + dy * MOVE_SPEED * dt / box.height));
  const left = soul.x * box.width;
  const top = soul.y * box.height;
  els.soul.style.left = els.shield.style.left = `${left}px`;
  els.soul.style.top = els.shield.style.top = `${top}px`;
}

function updateHud() {
  els.hp.textContent = hp;
  els.score.textContent = score;
  els.combo.textContent = combo;
}

function gameOver() {
  playing = false;
  audio?.pause();
  els.timing.textContent = "GAME OVER";
  els.status.textContent = "전투 시작을 눌러 다시 도전하세요.";
}

function loop(now) {
  const dt = Math.min(.033, (now - lastFrame) / 1000);
  lastFrame = now;
  finishDefense(now);
  if (cooldownUntil) {
    const remaining = Math.max(0, cooldownUntil - now);
    els.cooldown.style.transform = `scaleX(${1 - remaining / EMPTY_DEFENSE_COOLDOWN_MS})`;
    if (!remaining) {
      cooldownUntil = 0;
      els.shield.classList.remove("cooldown");
      els.defenseState.textContent = "READY";
    }
  } else {
    els.cooldown.style.transform = "scaleX(1)";
  }
  updateSoul(dt);
  if (playing) {
    if (now >= nextAttackAt) spawnAttack(now);
    updateAttacks(dt, now);
  }
  requestAnimationFrame(loop);
}

document.getElementById("start").addEventListener("click", start);
document.getElementById("defend").addEventListener("pointerdown", defend);
addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  if (key === "enter" && !playing) { start(); return; }
  if (["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d"].includes(key)) {
    event.preventDefault();
    keys.add(key);
    return;
  }
  if (!event.repeat) defend();
});
addEventListener("keyup", event => keys.delete(event.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
updateHud();
requestAnimationFrame(loop);
