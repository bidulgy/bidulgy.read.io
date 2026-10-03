let audio = null;
let playing = false;

let bpm = 120;
let nextBeat = 0;

let score = 0;
let combo = 0;

const timing = document.getElementById("timing");
const flash = document.getElementById("beatFlash");
const status = document.getElementById("status");


// 음악 시작
function start(){

  if(!audio){

    audio = new Audio("assets/sans.mp3");

    audio.loop = true;
    audio.volume = 0.7;
  }

  audio.play().catch(() => {});

  playing = true;

  nextBeat = performance.now();

  status.textContent =
    "박자에 맞춰 아무 키나 누르세요.";

  timing.textContent = "READY";
}


// 리듬 판정
function judge(){

  if(!playing) return;

  const now = performance.now();

  const interval = 60000 / bpm;

  let distance =
    Math.abs(now - nextBeat);

  distance =
    Math.min(
      distance,
      interval - distance
    );


  // PERFECT
  if(distance < 70){

    score += 100;
    combo++;

    timing.textContent = "PERFECT";

  }

  // GOOD
  else if(distance < 140){

    score += 50;
    combo++;

    timing.textContent = "GOOD";

  }

  // MISS
  else{

    combo = 0;

    timing.textContent = "MISS";
  }


  status.textContent =
    `SCORE ${score}   COMBO ${combo}`;


  setTimeout(() => {

    timing.textContent = "•";

  },220);
}


// 박자 표시
function loop(now){

  if(playing){

    const interval =
      60000 / bpm;


    if(now >= nextBeat){

      nextBeat =
        now + interval;


      // 화면 박자 효과
      flash.style.opacity = ".20";


      setTimeout(() => {

        flash.style.opacity = "0";

      },70);
    }
  }

  requestAnimationFrame(loop);
}


// 버튼
document
  .getElementById("start")
  .onclick = start;


document
  .getElementById("hit")
  .onclick = judge;


// 키보드
addEventListener("keydown", e => {

  if(e.repeat) return;


  // Enter = 음악 시작
  if(e.key === "Enter"){

    start();

  }

  // 그 외 아무 키 = 리듬 방어
  else if(playing){

    judge();
  }

});


requestAnimationFrame(loop);