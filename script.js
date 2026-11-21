const $ = (id) => document.getElementById(id);
let audioContext = null, chimesEnabled = false, lastChimeKey = null;
let manualBase = null, manualStarted = null;

for (let n = 1; n <= 12; n++) {
  const mark = document.createElement("span"), angle = n * Math.PI / 6;
  mark.textContent = n;
  mark.style.left = `${50 + 39 * Math.sin(angle)}%`;
  mark.style.top = `${50 - 39 * Math.cos(angle)}%`;
  $("numerals").appendChild(mark);
}
const pad = n => String(n).padStart(2, "0");
function clockNow() {
  return $("timeSource").value !== "manual" || !manualBase
    ? new Date() : new Date(manualBase.getTime() + Date.now() - manualStarted);
}
function displayTime(date) {
  const h = date.getHours();
  return `${pad(h % 12 || 12)}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${h >= 12 ? "PM" : "AM"}`;
}
function updateClock() {
  const date = clockNow(), h = date.getHours(), m = date.getMinutes(), s = date.getSeconds();
  const shown = displayTime(date);
  $("bigTime").textContent = shown;
  $("digitalTime").textContent = shown;
  $("dateReadout").textContent = date.toLocaleDateString(undefined, {weekday:"long",day:"numeric",month:"long",year:"numeric"});
  $("hourHand").style.transform = `translateX(-50%) rotate(${(h % 12) * 30 + m * .5}deg)`;
  $("minuteHand").style.transform = `translateX(-50%) rotate(${m * 6 + s * .1}deg)`;

  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${h}-${m}`;
  if (chimesEnabled && m === 0 && s === 0 && key !== lastChimeKey) {
    lastChimeKey = key;
    const quiet = $("quietHours").checked && (h >= 22 || h < 7);
    // 17:00 -> 5 strikes; 00:00 -> 12 strikes.
    if (!$("mute").checked && !quiet) strike(h % 12 || 12);
  }
}
async function enableAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { $("statusLine").textContent = "Audio is not supported by this browser"; return false; }
  if (!audioContext) audioContext = new AC();
  if (audioContext.state === "suspended") await audioContext.resume();
  return audioContext.state === "running";
}
function animateBells() {
  for (const id of ["bellLeft","bellRight"]) {
    const bell = $(id);
    bell.classList.remove("ringing"); void bell.offsetWidth; bell.classList.add("ringing");
    bell.addEventListener("animationend", () => bell.classList.remove("ringing"), {once:true});
  }
}
function makeBell(start, volume) {
  const now = audioContext.currentTime + start, master = audioContext.createGain();
  master.connect(audioContext.destination);
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.045);
  master.gain.setTargetAtTime(0.0001, now + 0.16, 1.65);

  // Lower fundamental and layered partials for a fuller, deeper bronze-bell character.
  const partials = [
    [65.4,0.24,"sine",-2], [130.8,0.95,"sine",0],
    [262.2,0.38,"sine",1], [392.8,0.23,"sine",-1],
    [523.4,0.13,"triangle",1], [659.1,0.065,"sine",-2]
  ];
  for (const [hz,level,type,detune] of partials) {
    const osc = audioContext.createOscillator(), gain = audioContext.createGain();
    osc.type = type; osc.frequency.setValueAtTime(hz, now); osc.detune.setValueAtTime(detune, now);
    gain.gain.value = level; osc.connect(gain); gain.connect(master);
    osc.start(now); osc.stop(now + 6.2);
  }
}
function strike(count) {
  animateBells();
  const volume = Number($("volume").value) / 100 * 0.38;
  for (let i=0; i<count; i++) makeBell(i * 1.38, volume);
  $("statusLine").innerHTML = `<span class="status-dot active"></span> Striking ${count} ${count===1?"time":"times"}`;
  setTimeout(() => { if (chimesEnabled) $("statusLine").innerHTML='<span class="status-dot active"></span> Hourly chimes enabled'; }, count*1380+1400);
}
$("chimeToggle").addEventListener("click", async () => {
  if (!chimesEnabled) {
    if (!(await enableAudio())) return;
    chimesEnabled=true; $("chimeToggle").textContent="Disable hourly chimes";
    $("statusLine").innerHTML='<span class="status-dot active"></span> Hourly chimes enabled';
  } else {
    chimesEnabled=false; $("chimeToggle").textContent="Enable hourly chimes";
    $("statusLine").innerHTML='<span class="status-dot"></span> Hourly chimes disabled';
  }
});
$("testChime").addEventListener("click", async () => {
  if (await enableAudio()) { strike(4); $("statusLine").innerHTML='<span class="status-dot active"></span> Test chime — four deep strikes'; }
});
function toggleSettings(open) {
  $("settingsPanel").hidden=!open; $("settingsToggle").setAttribute("aria-expanded",String(open));
}
$("settingsToggle").addEventListener("click",()=>toggleSettings($("settingsPanel").hidden));
$("closeSettings").addEventListener("click",()=>toggleSettings(false));
$("nightToggle").addEventListener("click",()=>{
  const night=document.body.classList.toggle("night");
  $("nightToggle").setAttribute("aria-pressed",String(night));
  $("nightToggle").textContent=night?"☀":"☾";
  $("nightToggle").title=night?"Day mode":"Night mode";
});
$("timeSource").addEventListener("change",()=>{
  const manual=$("timeSource").value==="manual"; $("manualFields").hidden=!manual;
  if (manual && !$("manualTime").value) {
    const now=new Date(); $("manualTime").value=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16);
  }
  $("settingsStatus").textContent=manual?"Manual time selected. Apply a time below.":"Using system time.";
  lastChimeKey=null;
});
$("applyManual").addEventListener("click",()=>{
  if (!$("manualTime").value) { $("settingsStatus").textContent="Choose a date and time first."; return; }
  manualBase=new Date($("manualTime").value); manualStarted=Date.now(); lastChimeKey=null;
  updateClock(); $("settingsStatus").textContent="Manual clock time applied and running.";
});
$("volume").addEventListener("input",e=>$("volumeLabel").textContent=`${e.target.value}%`);
setInterval(updateClock,200); updateClock();
document.addEventListener("visibilitychange",()=>{
  if (!document.hidden && audioContext?.state==="suspended") audioContext.resume().catch(()=>{});
});
