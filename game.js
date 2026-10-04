const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ui = {
  time: document.getElementById("time"), progress: document.getElementById("progress"),
  enemy: document.getElementById("bossHp"), hp: document.getElementById("life"),
  combo: document.querySelector("#combo b"), fury: document.getElementById("overdriveFill"),
  furyBox: document.getElementById("overdrive"), judge: document.getElementById("judge"),
  start: document.getElementById("startPanel"), result: document.getElementById("resultPanel"),
  resultTitle: document.getElementById("resultTitle"), resultText: document.getElementById("resultText")
};

const art = {};
for (const [name,src] of Object.entries({background:"assets/judgment-hall.png",sans:"assets/sans-character.png",blaster:"assets/gaster-blaster.png"})){
  art[name]=new Image();art[name].src=src;
}

const COOLDOWN_MS=300;
const HIT_WINDOW=.2;
const APPROACH_TIME=1.05;
const directions=["up","right","down","left"];
const directionKey={w:"up",d:"right",s:"down",a:"left"};
const directionAngle={right:0,down:Math.PI/2,left:Math.PI,up:-Math.PI/2};
const directionColor={up:"#55dfff",right:"#ffd84d",down:"#ff4c62",left:"#9b70ff"};

let audio,audioContext,chart=[],shots=[],particles=[],slashes=[];
let state="idle",chartIndex=0,hp=100,combo=0,bestCombo=0,fury=0,enemy=100,lastSlashAt=-Infinity;
let shake=0,flash=0,lastFrame=performance.now();

fetch("chart.json").then(r=>r.json()).then(data=>chart=data);
function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);canvas.width=r.width*d;canvas.height=r.height*d;ctx.setTransform(d,0,0,d,0,0)}
addEventListener("resize",resize);resize();

function bell(freq=1150,power=1){audioContext||=new(window.AudioContext||window.webkitAudioContext)();const now=audioContext.currentTime,m=audioContext.createGain();m.gain.setValueAtTime(.11*power,now);m.gain.exponentialRampToValueAtTime(.0001,now+.42);m.connect(audioContext.destination);[1,2.02,3.9].forEach((r,i)=>{const o=audioContext.createOscillator(),g=audioContext.createGain();o.type="sine";o.frequency.value=freq*r;g.gain.value=[1,.3,.09][i];o.connect(g).connect(m);o.start(now);o.stop(now+.44)})}
function badSound(){audioContext||=new(window.AudioContext||window.webkitAudioContext)();const o=audioContext.createOscillator(),g=audioContext.createGain(),n=audioContext.currentTime;o.type="sawtooth";o.frequency.setValueAtTime(130,n);o.frequency.exponentialRampToValueAtTime(48,n+.15);g.gain.setValueAtTime(.045,n);g.gain.exponentialRampToValueAtTime(.0001,n+.17);o.connect(g).connect(audioContext.destination);o.start(n);o.stop(n+.18)}

function reset(){shots=[];particles=[];slashes=[];chartIndex=0;hp=100;combo=0;bestCombo=0;fury=0;enemy=100;lastSlashAt=-Infinity;updateHud()}
function start(){document.activeElement?.blur();audioContext||=new(window.AudioContext||window.webkitAudioContext)();audioContext.resume();if(!audio){audio=new Audio("assets/sans.mp3");audio.volume=.78;audio.addEventListener("ended",()=>finish(true))}audio.pause();audio.currentTime=0;reset();ui.start.style.display="none";ui.result.classList.remove("show");state="countdown";let n=3;showJudge("3","#fff");const timer=setInterval(()=>{n--;if(n){showJudge(String(n),"#fff");bell(430,.3)}else{clearInterval(timer);showJudge("FIGHT!","#ffd84d");state="playing";audio.play().catch(()=>{})}},600)}

function shotDirection(note,index){
  if(note.type==="arrow")return directions[index%4];
  if(note.type==="cross")return directions[(index+2)%4];
  if(note.type==="orb")return directions[(Math.floor(note.x/180)+index)%4];
  return directions[Math.floor((note.x||0)/205)%4];
}
function spawnShot(note,index){shots.push({time:note.time,dir:shotDirection(note,index),type:note.type,cut:false,missed:false})}

function slash(dir,event){
  event?.preventDefault();document.activeElement?.blur();if(state!=="playing")return;
  const now=performance.now();if(now-lastSlashAt<COOLDOWN_MS){badSound();showJudge("WAIT","#888");return}lastSlashAt=now;
  slashes.push({dir,life:1});
  let target=null,best=Infinity;
  for(const shot of shots){if(shot.cut||shot.missed||shot.dir!==dir)continue;const d=Math.abs(shot.time-audio.currentTime);if(d<best){best=d;target=shot}}
  if(!target||best>HIT_WINDOW){combo=0;fury=Math.max(0,fury-5);badSound();showJudge("MISS","#888");updateHud();return}
  target.cut=true;combo++;bestCombo=Math.max(bestCombo,combo);const perfect=best<.075;fury=Math.min(100,fury+(perfect?8:4));enemy=Math.max(0,enemy-(perfect?1.2:.65));shake=perfect?13:7;flash=perfect?.25:.12;
  burst(dir,target.type,perfect?34:20);bell(perfect?1450:1050,perfect?1:.7);showJudge(perfect?"PERFECT":"SLASH",directionColor[dir]);updateHud();
}

function failShot(shot){shot.missed=true;hp=Math.max(0,hp-9);combo=0;fury=Math.max(0,fury-10);shake=16;flash=.2;badSound();showJudge("HIT","#ff3b48");updateHud();if(!hp)finish(false)}
function burst(dir,type,count){const a=directionAngle[dir]+Math.PI;for(let i=0;i<count;i++){const angle=a+(Math.random()-.5)*1.8,s=90+Math.random()*300;particles.push({x:0,y:0,vx:Math.cos(angle)*s,vy:Math.sin(angle)*s,life:.35+Math.random()*.45,size:2+Math.random()*6,color:i%3?directionColor[dir]:"#fff",angle})}if(type==="orb")flash=.38}
function showJudge(text,color){ui.judge.textContent=text;ui.judge.style.color=color;ui.judge.classList.remove("show");void ui.judge.offsetWidth;ui.judge.classList.add("show")}
function updateHud(){ui.hp.style.width=`${hp}%`;ui.enemy.style.width=`${enemy}%`;ui.combo.textContent=combo;ui.fury.style.width=`${fury}%`;ui.furyBox.classList.toggle("live",fury>=100)}
function finish(won){if(state!=="playing")return;state=won?"clear":"failed";audio.pause();ui.resultTitle.textContent=won?"COMPLETE":"SOUL SHATTERED";ui.resultText.textContent=`최고 콤보 ${bestCombo} · 적 체력 ${Math.round(enemy)}%`;ui.result.classList.add("show");if(won){bell(700,1);setTimeout(()=>bell(1050,.8),130)}}

function drawBackground(w,h){if(art.background.complete){const ir=art.background.width/art.background.height,vr=w/h;let sw=art.background.width,sh=art.background.height,sx=0,sy=0;if(ir>vr){sw=art.background.height*vr;sx=(art.background.width-sw)/2}else{sh=art.background.width/vr;sy=(art.background.height-sh)/2}ctx.drawImage(art.background,sx,sy,sw,sh,0,0,w,h)}else{ctx.fillStyle="#09070b";ctx.fillRect(0,0,w,h)}ctx.fillStyle="rgba(0,0,0,.55)";ctx.fillRect(0,0,w,h)}
function drawSans(w,h,now){if(!art.sans.complete)return;const hh=Math.min(165,h*.31),ww=hh*art.sans.width/art.sans.height;ctx.save();ctx.imageSmoothingEnabled=false;ctx.shadowBlur=12;ctx.shadowColor="#000";ctx.drawImage(art.sans,w/2-ww/2,h*.03+Math.sin(now/330)*2,ww,hh);ctx.restore()}
function drawArena(w,h){const size=Math.min(w*.48,h*.52),x=w/2-size/2,y=h*.38;ctx.fillStyle="rgba(0,0,0,.78)";ctx.fillRect(x,y,size,size);ctx.strokeStyle="#fff";ctx.lineWidth=5;ctx.strokeRect(x,y,size,size);return{x,y,size,cx:w/2,cy:y+size/2}}
function drawHeart(x,y){ctx.save();ctx.translate(x,y);ctx.fillStyle="#46d9ff";ctx.shadowBlur=18;ctx.shadowColor="#46d9ff";ctx.beginPath();ctx.moveTo(0,18);ctx.bezierCurveTo(-7,8,-22,-3,-22,-15);ctx.bezierCurveTo(-22,-28,-5,-30,0,-17);ctx.bezierCurveTo(5,-30,22,-28,22,-15);ctx.bezierCurveTo(22,-3,7,8,0,18);ctx.fill();ctx.restore()}

function projectilePosition(shot,arena){const remain=shot.time-audio.currentTime,p=1-Math.max(0,Math.min(1,remain/APPROACH_TIME)),edge=arena.size*.48,r=edge*(1-p);const a=directionAngle[shot.dir];return{x:arena.cx+Math.cos(a)*r,y:arena.cy+Math.sin(a)*r,a,p}}
function drawSpear(x,y,a,color,scale=1){ctx.save();ctx.translate(x,y);ctx.rotate(a+Math.PI);ctx.scale(scale,scale);ctx.shadowBlur=18;ctx.shadowColor=color;ctx.fillStyle="#fff";ctx.strokeStyle="#05050a";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(34,0);ctx.lineTo(11,-13);ctx.lineTo(15,-5);ctx.lineTo(-28,-5);ctx.lineTo(-36,0);ctx.lineTo(-28,5);ctx.lineTo(15,5);ctx.lineTo(11,13);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle=color;ctx.fillRect(-24,-2,47,4);ctx.restore()}
function drawShots(arena){
  for(const shot of shots){if(shot.cut||shot.missed)continue;const p=projectilePosition(shot,arena);if(shot.type==="orb"&&art.blaster.complete){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a+Math.PI);ctx.imageSmoothingEnabled=false;const s=76+p.p*24;ctx.drawImage(art.blaster,-s*.68,-s*.38,s*1.36,s*.76);ctx.restore()}else drawSpear(p.x,p.y,p.a,directionColor[shot.dir],shot.type==="cross"?1.25:1)}
}
function drawDirectionHints(arena){for(const dir of directions){const a=directionAngle[dir],r=arena.size*.36,x=arena.cx+Math.cos(a)*r,y=arena.cy+Math.sin(a)*r;ctx.save();ctx.translate(x,y);ctx.fillStyle="rgba(0,0,0,.72)";ctx.strokeStyle=directionColor[dir];ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,17,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle="#fff";ctx.font="bold 15px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText({up:"W",left:"A",down:"S",right:"D"}[dir],0,1);ctx.restore()}}
function drawSlashes(arena){slashes=slashes.filter(s=>{s.life-=.09;if(s.life<=0)return false;const a=directionAngle[s.dir],r=arena.size*.19;ctx.save();ctx.translate(arena.cx+Math.cos(a)*r,arena.cy+Math.sin(a)*r);ctx.rotate(a);ctx.strokeStyle=`rgba(255,255,255,${s.life})`;ctx.lineWidth=8*s.life+2;ctx.shadowBlur=20;ctx.shadowColor=directionColor[s.dir];ctx.beginPath();ctx.arc(0,0,48,-1.1,1.1);ctx.stroke();ctx.restore();return true})}
function drawParticles(arena,dt){particles=particles.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.life<=0)return false;ctx.save();ctx.globalAlpha=Math.min(1,p.life*2);ctx.translate(arena.cx+p.x,arena.cy+p.y);ctx.rotate(p.angle);ctx.fillStyle=p.color;ctx.fillRect(-p.size*3,-p.size/2,p.size*6,p.size);ctx.restore();return true})}

function loop(now){const dt=Math.min(.033,(now-lastFrame)/1000);lastFrame=now;const r=canvas.getBoundingClientRect(),w=r.width,h=r.height;if(state==="playing"){while(chartIndex<chart.length&&chart[chartIndex].time-audio.currentTime<=APPROACH_TIME)spawnShot(chart[chartIndex],chartIndex++);for(const shot of shots)if(!shot.cut&&!shot.missed&&audio.currentTime-shot.time>HIT_WINDOW)failShot(shot);shots=shots.filter(s=>audio.currentTime-s.time<.7);const d=audio.duration||156;ui.time.textContent=`${Math.floor(audio.currentTime/60)}:${String(Math.floor(audio.currentTime%60)).padStart(2,"0")}`;ui.progress.style.width=`${audio.currentTime/d*100}%`}ctx.save();if(shake>.2){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake*=.82}drawBackground(w,h);drawSans(w,h,now);const arena=drawArena(w,h);drawDirectionHints(arena);drawShots(arena);drawHeart(arena.cx,arena.cy);drawSlashes(arena);drawParticles(arena,dt);if(flash>.01){ctx.fillStyle=`rgba(255,255,255,${flash})`;ctx.fillRect(0,0,w,h);flash*=.72}ctx.restore();requestAnimationFrame(loop)}

document.getElementById("start").addEventListener("pointerdown",e=>{e.preventDefault();start()});
document.getElementById("retry").addEventListener("pointerdown",e=>{e.preventDefault();start()});
document.querySelectorAll(".dpad button").forEach(button=>button.addEventListener("pointerdown",e=>slash(button.dataset.dir,e)));
addEventListener("keydown",e=>{const dir=directionKey[e.key.toLowerCase()];if(dir&&!e.repeat)slash(dir,e)});
requestAnimationFrame(loop);
