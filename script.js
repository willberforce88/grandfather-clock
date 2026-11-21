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
  const level = Number($("volume").value) / 100;
  const master = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1750, start);
  filter.Q.setValueAtTime(1.15, start);
  master.gain.setValueAtTime(0.0001, start);
  master.gain.linearRampToValueAtTime(level * 0.62, start + 0.04);
  master.gain.setValueAtTime(level * 0.62, start + 4.78);
  master.gain.exponentialRampToValueAtTime(0.0001, start + 5);
  filter.connect(master);
  master.connect(audioContext.destination);

  // Loud, crisp clockwork ticks for the full five seconds, like a mechanism winding up.
  // A short bright click followed by a lower mechanical tap gives each tick some body.
  for (let t = 0; t < 4.94; t += 0.155) {
    const tickTime = start + t;
    for (const [offset, hz, peak, wave] of [[0, 1850, 0.72, "square"], [0.028, 760, 0.42, "triangle"]]) {
      const click = audioContext.createOscillator();
      const clickGain = audioContext.createGain();
      click.type = wave;
      click.frequency.setValueAtTime(hz + Math.random() * 90, tickTime + offset);
      clickGain.gain.setValueAtTime(0.0001, tickTime + offset);
      clickGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * peak), tickTime + offset + 0.002);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, tickTime + offset + 0.028);
      click.connect(clickGain);
      clickGain.connect(filter);
      click.start(tickTime + offset);
      click.stop(tickTime + offset + 0.032);
    }
  }
}

function makeBell(start, volume, addEcho = false) {
  const now = audioContext.currentTime + start;
  const master = audioContext.createGain();
  const dry = audioContext.createGain();
  master.connect(dry);
  dry.connect(audioContext.destination);
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.025);
  // Keep each strike clean and distinct, with a short natural bronze decay.
  master.gain.setTargetAtTime(0.0001, now + 0.12, 0.72);

  // Only the final strike is sent through this quiet, short echo path.
  if (addEcho) {
    const echoSend = audioContext.createGain();
    const delay = audioContext.createDelay(1.0);
    const feedback = audioContext.createGain();
    echoSend.gain.value = 0.24;
    delay.delayTime.value = 0.34;
    feedback.gain.value = 0.22;
    master.connect(echoSend);
    echoSend.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(audioContext.destination);
  }

  // Rounded, low-pitched bell tone without the fizzy high harmonics.
  const partials = [
    [65.4, 0.30, "sine"], [130.8, 0.92, "sine"],
    [196.2, 0.20, "sine"], [261.6, 0.16, "sine"]
  ];
  for (const [hz, level, type] of partials) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, now);
    gain.gain.value = level;
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 3.2);
  }
}

function strike(count, label = "hour") {
  const volume = Number($("volume").value) / 100 * 0.38;
  for (let i = 0; i < count; i++) makeBell(i * 1.48, volume, true);
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
