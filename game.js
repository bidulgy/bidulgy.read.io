const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ui = {
  time: document.getElementById("time"), progress: document.getElementById("progress"),
  track: document.getElementById("bossHp"), sync: document.getElementById("life"),
  chain: document.querySelector("#combo b"), drive: document.getElementById("overdriveFill"),
  driveBox: document.getElementById("overdrive"), judge: document.getElementById("judge"),
  start: document.getElementById("startPanel"), result: document.getElementById("resultPanel"),
  resultTitle: document.getElementById("resultTitle"), resultText: document.getElementById("resultText")
};

const art = {};
for (const [name, src] of Object.entries({ background:"assets/judgment-hall.png", sans:"assets/sans-character.png", bone:"assets/bone.png", blaster:"assets/gaster-blaster.png" })) {
  art[name] = new Image(); art[name].src = src;
}

let audio, audioContext, chart = [], nodes = [], state = "idle";
let stepIndex = 0, chain = 0, bestChain = 0, sync = 100, drive = 0;
let particles = [], rings = [], blasts = [], shake = 0, flash = 0, lastFrame = performance.now();
const HIT_WINDOW = .19;
const directions = [0, 0, Math.PI/2, 0, -Math.PI/2, 0, Math.PI, Math.PI/2, 0, -Math.PI/2, Math.PI, 0];

fetch("chart.json").then(r=>r.json()).then(data=>{ chart=data; buildTrack(); });

function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);canvas.width=r.width*d;canvas.height=r.height*d;ctx.setTransform(d,0,0,d,0,0)}
addEventListener("resize",resize);resize();

function buildTrack(){
  nodes=[{x:0,y:0,time:0,type:"start"}];
  let x=0,y=0;
  chart.forEach((note,i)=>{const a=directions[i%directions.length];x+=Math.cos(a)*92;y+=Math.sin(a)*92;nodes.push({x,y,time:note.time,type:note.type})});
}

function bell(freq=1100,power=1){
  audioContext ||= new (window.AudioContext||window.webkitAudioContext)(); const now=audioContext.currentTime;
  const master=audioContext.createGain(); master.gain.setValueAtTime(.1*power,now); master.gain.exponentialRampToValueAtTime(.0001,now+.45); master.connect(audioContext.destination);
  [1,2.01,3.94].forEach((ratio,i)=>{const o=audioContext.createOscillator(),g=audioContext.createGain();o.type="sine";o.frequency.value=freq*ratio;g.gain.value=[1,.32,.1][i];o.connect(g).connect(master);o.start(now);o.stop(now+.46)});
}
function failSound(){audioContext ||= new (window.AudioContext||window.webkitAudioContext)();const o=audioContext.createOscillator(),g=audioContext.createGain(),n=audioContext.currentTime;o.type="sawtooth";o.frequency.setValueAtTime(120,n);o.frequency.exponentialRampToValueAtTime(55,n+.15);g.gain.setValueAtTime(.04,n);g.gain.exponentialRampToValueAtTime(.0001,n+.17);o.connect(g).connect(audioContext.destination);o.start(n);o.stop(n+.18)}

function reset(){stepIndex=0;chain=0;bestChain=0;sync=100;drive=0;particles=[];rings=[];blasts=[];updateHud()}
function start(){
  document.activeElement?.blur(); audioContext ||= new (window.AudioContext||window.webkitAudioContext)(); audioContext.resume();
  if(!audio){audio=new Audio("assets/sans.mp3");audio.volume=.78;audio.addEventListener("ended",()=>finish(true))}
  audio.pause();audio.currentTime=0;reset();ui.start.style.display="none";ui.result.classList.remove("show");state="countdown";
  let n=3;showJudge("3","#fff");const timer=setInterval(()=>{n--;if(n){showJudge(String(n),"#fff");bell(440,.35)}else{clearInterval(timer);showJudge("GO!","#ffd84d");state="playing";audio.play().catch(()=>{})}},600);
}

function input(event){
  event?.preventDefault();document.activeElement?.blur();if(state!=="playing"||stepIndex>=chart.length)return;
  const target=chart[stepIndex].time,diff=Math.abs(audio.currentTime-target);
  if(diff>HIT_WINDOW){chain=0;drive=Math.max(0,drive-5);failSound();showJudge("EARLY","#999");updateHud();return}
  const perfect=diff<=.075;stepIndex++;chain++;bestChain=Math.max(bestChain,chain);drive=Math.min(100,drive+(perfect?6:3));
  burst(perfect?32:18);rings.push({life:1,color:perfect?"#ffd84d":"#fff"});shake=perfect?12:6;flash=perfect?.25:.12;
  showJudge(perfect?"PERFECT":"GOOD",perfect?"#ffd84d":"#fff");bell(perfect?1320:920,perfect?1:.65);
  const passed=chart[stepIndex-1];if(passed.type==="orb")spawnBlaster();updateHud();
}

function miss(){stepIndex++;chain=0;sync=Math.max(0,sync-8);drive=Math.max(0,drive-10);shake=14;flash=.18;showJudge("MISS","#ff3b48");failSound();updateHud();if(!sync)finish(false)}
function updateHud(){ui.chain.textContent=chain;ui.sync.style.width=`${sync}%`;ui.drive.style.width=`${drive}%`;ui.track.style.width=`${chart.length?stepIndex/chart.length*100:0}%`;ui.driveBox.classList.toggle("live",drive>=100)}
function showJudge(text,color){ui.judge.textContent=text;ui.judge.style.color=color;ui.judge.classList.remove("show");void ui.judge.offsetWidth;ui.judge.classList.add("show")}
function burst(count){for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=90+Math.random()*260;particles.push({x:0,y:0,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.45,size:2+Math.random()*5,color:i%3?"#ffd84d":"#fff",angle:a})}}
function spawnBlaster(){blasts.push({life:1,angle:Math.random()*Math.PI*2})}

function finish(won){if(state!=="playing")return;state=won?"clear":"failed";audio.pause();ui.resultTitle.textContent=won?"COMPLETE":"SOUL LOST";ui.resultText.textContent=`최고 체인 ${bestChain} · 진행 ${Math.round(stepIndex/Math.max(1,chart.length)*100)}%`;ui.result.classList.add("show");if(won){bell(660,1);setTimeout(()=>bell(990,.8),130)}}

function drawBackground(w,h){
  if(art.background.complete){const ir=art.background.width/art.background.height,vr=w/h;let sw=art.background.width,sh=art.background.height,sx=0,sy=0;if(ir>vr){sw=art.background.height*vr;sx=(art.background.width-sw)/2}else{sh=art.background.width/vr;sy=(art.background.height-sh)/2}ctx.drawImage(art.background,sx,sy,sw,sh,0,0,w,h)}else{ctx.fillStyle="#09070b";ctx.fillRect(0,0,w,h)}
  ctx.fillStyle="rgba(0,0,0,.42)";ctx.fillRect(0,0,w,h);
}
function drawSans(w,h,now){if(!art.sans.complete)return;const height=Math.min(150,h*.29),width=height*art.sans.width/art.sans.height;ctx.save();ctx.imageSmoothingEnabled=false;ctx.shadowBlur=12;ctx.shadowColor="#000";ctx.drawImage(art.sans,w/2-width/2,h*.035+Math.sin(now/330)*2,width,height);ctx.restore()}

function camera(){const n=nodes[Math.min(stepIndex,nodes.length-1)]||{x:0,y:0};return{x:n.x,y:n.y}}
function drawTrack(w,h){
  if(!nodes.length)return;const cam=camera(),ox=w/2-cam.x,oy=h*.62-cam.y;
  ctx.lineWidth=8;ctx.lineJoin="round";ctx.strokeStyle="rgba(255,255,255,.24)";ctx.beginPath();
  nodes.forEach((n,i)=>{const x=n.x+ox,y=n.y+oy;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
  const from=Math.max(0,stepIndex-5),to=Math.min(nodes.length,stepIndex+12);
  for(let i=from;i<to;i++){const n=nodes[i],x=n.x+ox,y=n.y+oy,active=i===stepIndex;ctx.save();ctx.translate(x,y);ctx.rotate(Math.PI/4);ctx.fillStyle=active?"#fff":i<stepIndex?"rgba(255,216,77,.38)":"rgba(10,10,14,.88)";ctx.strokeStyle=active?"#ffd84d":"#fff";ctx.lineWidth=active?5:3;ctx.shadowBlur=active?18:0;ctx.shadowColor="#ffd84d";ctx.fillRect(-25,-25,50,50);ctx.strokeRect(-25,-25,50,50);ctx.restore()}
  drawSouls(ox,oy);
}

function drawHeart(x,y,color,size=17){ctx.save();ctx.translate(x,y);ctx.fillStyle=color;ctx.shadowBlur=18;ctx.shadowColor=color;ctx.beginPath();ctx.moveTo(0,size);ctx.bezierCurveTo(-size*.35,size*.4,-size,-size*.15,-size,-size*.65);ctx.bezierCurveTo(-size,-size*1.25,-size*.2,-size*1.35,0,-size*.75);ctx.bezierCurveTo(size*.2,-size*1.35,size,-size*1.25,size,-size*.65);ctx.bezierCurveTo(size,-size*.15,size*.35,size*.4,0,size);ctx.fill();ctx.restore()}
function drawSouls(ox,oy){
  const pivot=nodes[Math.min(stepIndex,nodes.length-1)]||nodes[0],prev=nodes[Math.max(0,stepIndex-1)]||pivot,next=nodes[Math.min(nodes.length-1,stepIndex+1)]||pivot;
  const px=pivot.x+ox,py=pivot.y+oy;let mx=px,my=py;
  if(state==="playing"&&stepIndex<chart.length){const prevTime=stepIndex?chart[stepIndex-1].time:0,target=chart[stepIndex].time;const p=Math.max(0,Math.min(1,(audio.currentTime-prevTime)/Math.max(.1,target-prevTime)));let a0=Math.atan2(prev.y-pivot.y,prev.x-pivot.x),a1=Math.atan2(next.y-pivot.y,next.x-pivot.x);while(a1<=a0)a1+=Math.PI*2;const a=a0+(a1-a0)*p;mx=px+Math.cos(a)*92;my=py+Math.sin(a)*92}
  const swap=stepIndex%2===0;drawHeart(px,py,swap?"#ff3045":"#42cfff",15);drawHeart(mx,my,swap?"#42cfff":"#ff3045",15);
}

function drawAttacks(w,h){
  const cx=w/2,cy=h*.62;
  blasts=blasts.filter(b=>{b.life-=.025;if(b.life<=0)return false;const r=Math.min(w,h)*.42,x=cx+Math.cos(b.angle)*r,y=cy+Math.sin(b.angle)*r;ctx.save();ctx.translate(x,y);ctx.rotate(b.angle+Math.PI);ctx.imageSmoothingEnabled=false;const s=110;ctx.drawImage(art.blaster,-s*.68,-s*.38,s*1.36,s*.76);ctx.strokeStyle=`rgba(85,223,255,${b.life})`;ctx.lineWidth=16*b.life+4;ctx.shadowBlur=20;ctx.shadowColor="#55dfff";ctx.beginPath();ctx.moveTo(s*.48,0);ctx.lineTo(r,0);ctx.stroke();ctx.restore();return true});
}

function drawEffects(w,h,dt){const cx=w/2,cy=h*.62;particles=particles.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.life<=0)return false;ctx.save();ctx.globalAlpha=Math.min(1,p.life*2);ctx.translate(cx+p.x,cy+p.y);ctx.rotate(p.angle);ctx.fillStyle=p.color;ctx.fillRect(-p.size*3,-p.size/2,p.size*6,p.size);ctx.restore();return true});rings=rings.filter(r=>{r.life-=dt*1.8;if(r.life<=0)return false;ctx.globalAlpha=r.life;ctx.strokeStyle=r.color;ctx.lineWidth=5;ctx.beginPath();ctx.arc(cx,cy,45+(1-r.life)*150,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;return true})}

function loop(now){
  const dt=Math.min(.033,(now-lastFrame)/1000);lastFrame=now;const r=canvas.getBoundingClientRect(),w=r.width,h=r.height;
  if(state==="playing"){
    while(stepIndex<chart.length&&audio.currentTime-chart[stepIndex].time>HIT_WINDOW)miss();
    const d=audio.duration||156;ui.time.textContent=`${Math.floor(audio.currentTime/60)}:${String(Math.floor(audio.currentTime%60)).padStart(2,"0")}`;ui.progress.style.width=`${audio.currentTime/d*100}%`;
  }
  ctx.save();if(shake>.2){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake*=.82}drawBackground(w,h);drawSans(w,h,now);drawTrack(w,h);drawAttacks(w,h);drawEffects(w,h,dt);if(flash>.01){ctx.fillStyle=`rgba(255,255,255,${flash})`;ctx.fillRect(0,0,w,h);flash*=.72}ctx.restore();requestAnimationFrame(loop)
}

document.getElementById("start").addEventListener("pointerdown",e=>{e.preventDefault();start()});
document.getElementById("retry").addEventListener("pointerdown",e=>{e.preventDefault();start()});
document.getElementById("pulse").addEventListener("pointerdown",input);canvas.addEventListener("pointerdown",input);
addEventListener("keydown",e=>{if(!e.repeat&&state==="playing")input(e)});
requestAnimationFrame(loop);
