const $ = (id) => document.getElementById(id);
let audioContext = null;
let chimesEnabled = false;
let lastChimeKey = null;
let manualBase = null;
let manualStarted = null;

const pad = n => String(n).padStart(2, "0");
function clockNow() {
  return $("timeSource").value !== "manual" || !manualBase
    ? new Date() : new Date(manualBase.getTime() + Date.now() - manualStarted);
}
function displayTime(date) {
  const h = date.getHours();
  return `${pad(h % 12 || 12)}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${h >= 12 ? "PM" : "AM"}`;
}
function isQuiet(date) {
  const h = date.getHours();
  return $("quietHours").checked && (h >= 22 || h < 7);
}
function updateClock() {
  const date = clockNow(), h = date.getHours(), m = date.getMinutes(), s = date.getSeconds();
  const shown = displayTime(date);
  $("bigTime").textContent = shown;
  $("digitalTime").textContent = shown;
  $("dateReadout").textContent = date.toLocaleDateString(undefined, {weekday:"long",day:"numeric",month:"long",year:"numeric"});

  // Begin winding at :55 before the hour, and :25 before the half-hour.
  const isHourChime = m === 59 && s >= 55;
  const isHalfHourChime = m === 29 && s >= 25;
  if (chimesEnabled && (isHourChime || isHalfHourChime)) {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${h}-${m}`;
    if (key !== lastChimeKey) {
      lastChimeKey = key;
      if (!$ ("mute").checked && !isQuiet(date)) {
        const count = isHourChime ? (h % 12 || 12) : 1;
        windUpThenStrike(count, isHourChime ? "hour" : "half-hour");
      }
    }
  }
}

async function enableAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { $("statusLine").textContent = "Audio is not supported by this browser"; return false; }
  if (!audioContext) audioContext = new AC();
  if (audioContext.state === "suspended") await audioContext.resume();
  return audioContext.state === "running";
}

function makeWindingSound() {
  const start = audioContext.currentTime;
  const master = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1250, start);
  filter.frequency.linearRampToValueAtTime(650, start + 5);
  master.gain.setValueAtTime(0.0001, start);
  master.gain.linearRampToValueAtTime(Number($("volume").value) / 100 * 0.10, start + 0.12);
  master.gain.setValueAtTime(Number($("volume").value) / 100 * 0.10, start + 4.65);
  master.gain.exponentialRampToValueAtTime(0.0001, start + 5);
  filter.connect(master);
  master.connect(audioContext.destination);

  // A soft, synthetic ratchet/clockwork whirr with little winding clicks.
  const motor = audioContext.createOscillator();
  const motorGain = audioContext.createGain();
  motor.type = "sawtooth";
  motor.frequency.setValueAtTime(105, start);
  motor.frequency.linearRampToValueAtTime(185, start + 4.8);
  motorGain.gain.value = 0.22;
  motor.connect(motorGain);
  motorGain.connect(filter);
  motor.start(start);
  motor.stop(start + 5.02);

  for (let t = 0; t < 5; t += 0.19) {
    const click = audioContext.createOscillator();
    const clickGain = audioContext.createGain();
    click.type = "square";
    click.frequency.setValueAtTime(720 + (Math.random() * 100), start + t);
    clickGain.gain.setValueAtTime(0.0001, start + t);
    clickGain.gain.exponentialRampToValueAtTime(0.035, start + t + 0.006);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, start + t + 0.045);
    click.connect(clickGain);
    clickGain.connect(filter);
    click.start(start + t);
    click.stop(start + t + 0.05);
  }
}

function makeBell(start, volume) {
  const now = audioContext.currentTime + start;
  const master = audioContext.createGain();
  master.connect(audioContext.destination);
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.045);
  master.gain.setTargetAtTime(0.0001, now + 0.16, 1.85);

  // Deep, layered bronze-bell tone with a low fundamental and long decay.
  const partials = [
    [65.4,0.24,"sine",-2], [130.8,0.95,"sine",0],
    [262.2,0.38,"sine",1], [392.8,0.23,"sine",-1],
    [523.4,0.13,"triangle",1], [659.1,0.065,"sine",-2]
  ];
  for (const [hz,level,type,detune] of partials) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, now);
    osc.detune.setValueAtTime(detune, now);
    gain.gain.value = level;
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 6.5);
  }
}

function strike(count, label = "hour") {
  const volume = Number($("volume").value) / 100 * 0.38;
  for (let i = 0; i < count; i++) makeBell(i * 1.48, volume);
  $("statusLine").innerHTML = `<span class="status-dot active"></span> ${label === "half-hour" ? "Half-hour chime — one deep strike" : `Striking ${count} ${count === 1 ? "time" : "times"}`}`;
  setTimeout(() => {
    if (chimesEnabled) $("statusLine").innerHTML = '<span class="status-dot active"></span> Hourly and half-hour chimes enabled';
  }, count * 1480 + 1800);
}

function windUpThenStrike(count, label) {
  $("statusLine").innerHTML = '<span class="status-dot active"></span> Winding…';
  makeWindingSound();
  window.setTimeout(() => strike(count, label), 5000);
}

$("chimeToggle").addEventListener("click", async () => {
  if (!chimesEnabled) {
    if (!(await enableAudio())) return;
    chimesEnabled = true;
    $("chimeToggle").textContent = "Disable chimes";
    $("statusLine").innerHTML = '<span class="status-dot active"></span> Hourly and half-hour chimes enabled';
  } else {
    chimesEnabled = false;
    $("chimeToggle").textContent = "Enable hourly chimes";
    $("statusLine").innerHTML = '<span class="status-dot"></span> Chimes disabled';
  }
});

$("testChime").addEventListener("click", async () => {
  if (await enableAudio()) {
    windUpThenStrike(4, "hour");
    $("statusLine").innerHTML = '<span class="status-dot active"></span> Test — winding for five seconds';
  }
});

function toggleSettings(open) {
  $("settingsPanel").hidden = !open;
  $("settingsToggle").setAttribute("aria-expanded", String(open));
}
$("settingsToggle").addEventListener("click", () => toggleSettings($("settingsPanel").hidden));
$("closeSettings").addEventListener("click", () => toggleSettings(false));
$("nightToggle").addEventListener("click", () => {
  const night = document.body.classList.toggle("night");
  $("nightToggle").setAttribute("aria-pressed", String(night));
  $("nightToggle").textContent = night ? "☀" : "☾";
  $("nightToggle").title = night ? "Day mode" : "Night mode";
});
$("timeSource").addEventListener("change", () => {
  const manual = $("timeSource").value === "manual";
  $("manualFields").hidden = !manual;
  if (manual && !$("manualTime").value) {
    const now = new Date();
    $("manualTime").value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0,16);
  }
  $("settingsStatus").textContent = manual ? "Manual time selected. Apply a time below." : "Using system time.";
  lastChimeKey = null;
});
$("applyManual").addEventListener("click", () => {
  if (!$("manualTime").value) { $("settingsStatus").textContent = "Choose a date and time first."; return; }
  manualBase = new Date($("manualTime").value);
  manualStarted = Date.now();
  lastChimeKey = null;
  updateClock();
  $("settingsStatus").textContent = "Manual clock time applied and running.";
});
$("volume").addEventListener("input", e => $("volumeLabel").textContent = `${e.target.value}%`);
setInterval(updateClock, 200);
updateClock();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && audioContext?.state === "suspended") audioContext.resume().catch(() => {});
});
