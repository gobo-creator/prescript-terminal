const defaultCommands = [
  "卒論を30分進めよ。",
  "薬理学の復習を20分行え。",
  "机の上を整理せよ。",
  "10分間ストレッチを行え。",
  "積んでいる本を10ページ読め。",
  "水分を補給し、5分間休息せよ。"
];

const STORAGE_COMMANDS = "prescript_commands_v1";
const STORAGE_HISTORY = "prescript_history_v1";

let commands = loadJson(STORAGE_COMMANDS, defaultCommands);
let history = loadJson(STORAGE_HISTORY, []);
let currentHistoryId = null;

const views = {
  idle: document.getElementById("idleView"),
  decoding: document.getElementById("decodingView")
};

const receiveButton = document.getElementById("receiveButton");
const retryButton = document.getElementById("retryButton");
const completeButton = document.getElementById("completeButton");
const settingsButton = document.getElementById("settingsButton");
const soundButton = document.getElementById("soundButton");
const commandDialog = document.getElementById("commandDialog");
const addCommandButton = document.getElementById("addCommandButton");
const commandInput = document.getElementById("commandInput");
const resetCommandsButton = document.getElementById("resetCommandsButton");
const clearHistoryButton = document.getElementById("clearHistoryButton");
const progressBar = document.getElementById("progressBar");
const decodingText = document.getElementById("decodingText");
const candidateText = document.getElementById("candidateText");
const decodingPhase = document.getElementById("decodingPhase");
const decodingTerminal = document.querySelector(".decoding-terminal");
const screenTitle = document.getElementById("screenTitle");
const screenFoot = document.getElementById("screenFoot");
const terminalModeLabel = document.getElementById("terminalModeLabel");
const analysisProgress = document.getElementById("analysisProgress");
const resultActions = document.getElementById("resultActions");
const resultText = document.getElementById("resultText");
const systemStatus = document.getElementById("systemStatus");
const deviceDisplay = document.getElementById("deviceDisplay");

// ===== SYNTHETIC TERMINAL AUDIO =====
// Original synthesized effects inspired by the uploaded reference:
// low mechanical hum + thin high-frequency scanner + dry relay clicks.
let audioCtx = null;
let masterGain = null;
let analysisHumNodes = [];
let analysisTickTimer = null;
let soundEnabled = localStorage.getItem("prescript_sound_v1") !== "off";

function ensureAudio() {
  if (!soundEnabled) return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.78;
    masterGain.connect(audioCtx.destination);
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function tone(freq, duration, volume = 0.08, type = "sine", startOffset = 0, endFreq = null) {
  const ctx = ensureAudio();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration + 0.03);
}

function noiseBurst(duration = 0.05, volume = 0.035, center = 5200, q = 1.5, startOffset = 0) {
  const ctx = ensureAudio();
  if (!ctx || !masterGain) return;

  const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = center;
  filter.Q.value = q;

  const gain = ctx.createGain();
  const now = ctx.currentTime + startOffset;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  src.start(now);
  src.stop(now + duration + 0.02);
}

function playButtonClick() {
  if (!soundEnabled) return;
  tone(1180, 0.025, 0.026, "square");
  noiseBurst(0.018, 0.02, 6500, 2.4, 0.003);
}

function playReceiveStart() {
  if (!soundEnabled) return;
  // Startup thump removed. Analysis transmission begins without an impact sound.
}

function startAnalysisSound() {
  stopAnalysisSound();
  const ctx = ensureAudio();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;

  // Barely audible machine bed; the foreground should be the dry data strokes.
  const carrierGain = ctx.createGain();
  carrierGain.gain.setValueAtTime(0.0001, now);
  carrierGain.gain.exponentialRampToValueAtTime(0.010, now + 0.10);
  carrierGain.connect(masterGain);

  const bedA = ctx.createOscillator();
  bedA.type = "sine";
  bedA.frequency.value = 82;
  bedA.connect(carrierGain);
  bedA.start(now);

  const bedB = ctx.createOscillator();
  bedB.type = "triangle";
  bedB.frequency.value = 164;
  const bedBGain = ctx.createGain();
  bedBGain.gain.value = 0.22;
  bedB.connect(bedBGain);
  bedBGain.connect(carrierGain);
  bedB.start(now);

  analysisHumNodes = [bedA, bedB, carrierGain, bedBGain];

  let packetIndex = 0;

  const sendPacket = () => {
    if (!soundEnabled || !audioCtx) return;
    packetIndex += 1;

    // Main dry "character" stroke. Keep the pitch moving so it does not
    // read as a repeated musical beep.
    const bands = [6050, 6640, 7180, 7730, 8420, 9050];
    const band = bands[(packetIndex * 5 + 2) % bands.length];
    const jitter = (Math.random() - 0.5) * 180;
    const hf = band + jitter;

    tone(hf, 0.007 + Math.random() * 0.006, 0.0090, "square");
    noiseBurst(0.010 + Math.random() * 0.006, 0.0080, hf, 7.8, 0.001);

    // Keep separators as dry high-frequency texture only.
    // Low/mid pitched body tones were removed to eliminate the "poko-poko" character.
    if (packetIndex % 6 === 0 || packetIndex % 11 === 0) {
      noiseBurst(0.012, 0.0075, 5200 + Math.random() * 1100, 6.5, 0.002);
    }
  };

  sendPacket();

  // Slightly slower than the result cascade and with tiny timing variation
  // supplied by the varying envelopes above.
  analysisTickTimer = window.setInterval(sendPacket, 61);
}

function stopAnalysisSound() {
  if (analysisTickTimer) {
    clearInterval(analysisTickTimer);
    analysisTickTimer = null;
  }

  if (!audioCtx) {
    analysisHumNodes = [];
    return;
  }

  const now = audioCtx.currentTime;
  analysisHumNodes.forEach((node) => {
    try {
      if (node.gain) {
        node.gain.cancelScheduledValues(now);
        node.gain.setValueAtTime(Math.max(0.0001, node.gain.value || 0.001), now);
        node.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      }
    } catch {}
  });

  setTimeout(() => {
    analysisHumNodes.forEach((node) => {
      try { if (node.stop) node.stop(); } catch {}
      try { node.disconnect(); } catch {}
    });
    analysisHumNodes = [];
  }, 130);
}

function playAnalysisLock() {
  if (!soundEnabled) return;
  // Low thump removed for comparison. Keep only the thin terminal confirmation.
  noiseBurst(0.028, 0.014, 8200, 7.0, 0.012);
  tone(7350, 0.018, 0.012, "sine", 0.018, 8100);
}

function playPrescriptReceived() {
  if (!soundEnabled) return;
  const ctx = ensureAudio();
  if (!ctx) return;

  // A rapid cascade of tiny terminal packets: intended to feel like
  // characters continue streaming in just before the prescript settles.
  const packetCount = 24;
  const interval = 0.021;

  for (let i = 0; i < packetCount; i++) {
    const t = i * interval;
    const lane = i % 6;

    // Thin high-frequency strokes with slight irregularity.
    const base = [7050, 7480, 7920, 8350, 8840, 9320][lane];
    const jitter = ((i * 37) % 83) - 41;
    const freq = base + jitter;

    tone(freq, 0.009 + (i % 3) * 0.002, 0.0095, "square", t);
    noiseBurst(0.008, 0.0055, freq, 9.0, t + 0.001);

    // Delimiters are now dry high-frequency texture only.
    // Low/mid pitched pulses were removed to eliminate the "poko-poko" sound.
    if (i === 7 || i === 15 || i === 23) {
      noiseBurst(0.010, 0.0055, 5900, 6.5, t + 0.005);
    }
  }

  // Final very short acknowledgement after the stream stops.
  const end = packetCount * interval + 0.015;
  tone(8220, 0.028, 0.010, "sine", end, 8700);
  tone(9650, 0.022, 0.0065, "sine", end + 0.010, 9300);
}

function playCompleteSound() {
  if (!soundEnabled) return;
  tone(420, 0.06, 0.04, "square");
  tone(620, 0.09, 0.035, "square", 0.055);
  tone(980, 0.1, 0.028, "sine", 0.11);
}

function updateSoundButton() {
  if (!soundButton) return;
  soundButton.textContent = soundEnabled ? "SOUND ON" : "SOUND OFF";
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  soundButton.classList.toggle("muted", !soundEnabled);
}

function setSoundEnabled(enabled) {
  soundEnabled = enabled;
  localStorage.setItem("prescript_sound_v1", enabled ? "on" : "off");
  if (!enabled) stopAnalysisSound();
  updateSoundButton();
}


function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_COMMANDS, JSON.stringify(commands));
  localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history));
}

function showView(name) {
  Object.values(views).forEach((view) => {
    if (view) view.classList.remove("active");
  });
  if (views[name]) views[name].classList.add("active");
}

function updateCounts() {
  document.getElementById("commandCount").textContent = commands.length;
  document.getElementById("historyCount").textContent = history.length;
}

function randomCommand() {
  return commands[Math.floor(Math.random() * commands.length)];
}

function getResponsiveLineCount() {
  return 2;
}

function fitCodeMatrixFont(lineCount = 2) {
  if (!candidateText) return;

  const screen = document.querySelector(".decoding-screen");
  if (!screen) return;

  candidateText.dataset.lines = "2";

  // Two rows only: prioritize readability and fit mainly against width.
  const width = Math.max(1, screen.clientWidth);

  let size;
  if (width >= 700) {
    size = 27;
  } else if (width >= 560) {
    size = 24;
  } else if (width >= 430) {
    size = 21;
  } else if (width >= 340) {
    size = 17;
  } else {
    size = 14;
  }

  candidateText.style.setProperty("--matrix-font-size", `${size}px`);

  // Only shrink when a line genuinely exceeds the available horizontal space.
  const maxWidth = Math.max(1, candidateText.clientWidth - 6);
  let guard = 0;

  while (guard < 16 && candidateText.scrollWidth > maxWidth && size > 12) {
    size -= 0.5;
    candidateText.style.setProperty("--matrix-font-size", `${size}px`);
    guard += 1;
  }
}

async function receivePrescript() {
  if (commands.length === 0) {
    alert("指令が登録されていません。先に指令を追加してください。");
    commandDialog.showModal();
    return;
  }

  receiveButton.disabled = true;
  ensureAudio();
  playReceiveStart();
  showView("decoding");

  // Reset the SAME terminal to analysis mode.
  systemStatus.textContent = "DECODING";
  terminalModeLabel.textContent = "DECODING";
  screenTitle.textContent = "// ANALYZING";
  screenFoot.textContent = "PRESCRIPT ENGINE ACTIVE";
  decodingPhase.textContent = "INITIALIZE";
  progressBar.style.width = "0%";
  analysisProgress.classList.remove("output-ready");
  decodingText.classList.remove("output-ready");
  decodingText.textContent = "指令を解析中...";
  resultActions.classList.remove("visible");
  resultText.classList.remove("revealing");
  resultText.textContent = "";
  resultText.style.display = "none";
  resultText.style.opacity = "";
  resultText.style.visibility = "";
  candidateText.style.display = "grid";
  candidateText.classList.remove("dissolving");
  candidateText.classList.add("scramble");
  decodingTerminal?.classList.remove("output-mode", "finalizing");
  decodingTerminal?.classList.add("active-pulse");

  const chars = "A7F29C4D3B1EF0A96D2C81X7V5KQZ";
  const sigils = ["⟦", "⟪", "⌁", "◇", "∷", "╱", "∆", "0X", "RX", "QF"];
  const tails = ["⟧", "⟫", "∷", "◇", "⌁", "╲", "∆", "NX", "FF"];

  function randomBlock(len = 4) {
    let out = "";
    for (let i = 0; i < len; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  function randomCodeLine() {
    const sigil = sigils[Math.floor(Math.random() * sigils.length)];
    const tail = tails[Math.floor(Math.random() * tails.length)];
    const route = String(Math.floor(Math.random() * 97)).padStart(2, "0");
    return `${sigil}${route}∷${randomBlock(4)}·${randomBlock(4)}╱${randomBlock(4)}-${randomBlock(4)}╱${randomBlock(4)}·${randomBlock(4)}${tail}`;
  }

  function renderCodeMatrix() {
    candidateText.innerHTML = `
      <div>${randomCodeLine()}</div>
      <div>${randomCodeLine()}</div>
    `;
    requestAnimationFrame(() => {
      if (typeof fitCodeMatrixFont === "function") fitCodeMatrixFont(2);
    });
  }

  const phases = ["0X_A1", "RX_7F", "VX_3C", "QF_91", "NX_0D", "PX_A8", "ZX_44"];
  const totalSteps = 17;
  let step = 0;

  startAnalysisSound();

  await new Promise((resolve) => {
    const timer = setInterval(() => {
      step += 1;
      progressBar.style.width = `${Math.min(100, Math.round((step / totalSteps) * 100))}%`;
      decodingPhase.textContent =
        phases[Math.min(phases.length - 1, Math.floor((step / totalSteps) * phases.length))];

      // Slow only the visible code stream; total analysis duration stays unchanged.
      if (step % 2 === 0) {
        renderCodeMatrix();
      }

      if (step >= totalSteps) {
        clearInterval(timer);
        resolve();
      }
    }, 105);
  });

  stopAnalysisSound();
  playAnalysisLock();

  candidateText.classList.remove("scramble");
  decodingTerminal?.classList.remove("active-pulse");
  decodingTerminal?.classList.add("finalizing");

  decodingPhase.textContent = "0X_FF";
  candidateText.innerHTML = `
    <div>⟦17∷A7F2·9C4D╱3B1E-F0A9╱6D2C·81X7⟧</div>
    <div>◇42∷V5KQ·Z7F2╱C91D-0A6E╱B431·F82X◇</div>
  `;
  if (typeof fitCodeMatrixFont === "function") fitCodeMatrixFont(2);
  await wait(360);

  decodingPhase.textContent = "RX_OK";
  progressBar.style.width = "100%";
  await wait(260);

  const chosen = randomCommand();
  const entry = {
    id: crypto.randomUUID(),
    text: chosen,
    done: false,
    receivedAt: new Date().toISOString()
  };

  history.unshift(entry);
  currentHistoryId = entry.id;
  saveState();
  renderHistory();
  updateCounts();

  // No page/view change here. The codes dissolve inside the same terminal.
  candidateText.classList.add("dissolving");
  await wait(430);

  candidateText.style.display = "none";
  playPrescriptReceived();
  decodingTerminal?.classList.remove("finalizing");
  decodingTerminal?.classList.add("output-mode");

  terminalModeLabel.textContent = "PRESCRIPT RECEIVED";
  screenTitle.textContent = "// PRESCRIPT";
  decodingPhase.textContent = "CONFIRMED";
  screenFoot.textContent = "OBEY / EXECUTE";
  systemStatus.textContent = "PRESCRIPT RECEIVED";

  analysisProgress.classList.add("output-ready");
  decodingText.classList.add("output-ready");

  resultText.textContent = chosen;
  resultText.style.display = "block";
  resultText.style.opacity = "1";
  resultText.style.visibility = "visible";
  resultText.classList.remove("revealing");

  // Force a layout flush, then reveal inside the exact same terminal.
  void resultText.offsetWidth;
  resultText.classList.add("revealing");

  await wait(620);
  resultActions.classList.add("visible");

  completeButton.textContent = "遂行済みにする";
  completeButton.disabled = false;
  receiveButton.disabled = false;
}

function renderCommands() {
  const list = document.getElementById("commandList");
  list.innerHTML = "";

  if (commands.length === 0) {
    list.innerHTML = '<div class="empty-state">登録された指令はありません。</div>';
    return;
  }

  commands.forEach((command, index) => {
    const item = document.createElement("div");
    item.className = "command-item";

    const text = document.createElement("span");
    text.textContent = command;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "削除";
    remove.addEventListener("click", () => {
      commands.splice(index, 1);
      saveState();
      renderCommands();
      updateCounts();
    });

    item.append(text, remove);
    list.appendChild(item);
  });
}

function renderHistory() {
  const list = document.getElementById("historyList");
  list.innerHTML = "";

  if (history.length === 0) {
    list.innerHTML = '<div class="empty-state">まだ指令を受領していません。</div>';
    return;
  }

  history.forEach((entry) => {
    const item = document.createElement("div");
    item.className = `history-item${entry.done ? " done" : ""}`;

    const meta = document.createElement("div");
    meta.className = "history-meta";
    meta.textContent = formatDate(entry.receivedAt) + (entry.done ? " / 遂行済" : " / 未遂行");

    const text = document.createElement("div");
    text.className = "history-text";
    text.textContent = entry.text;

    item.append(meta, text);
    list.appendChild(item);
  });
}

function formatDate(iso) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}

function addCommand() {
  const value = commandInput.value.trim();
  if (!value) return;

  commands.push(value);
  commandInput.value = "";
  saveState();
  renderCommands();
  updateCounts();
  commandInput.focus();
}


function resizeCodeMatrixToTerminal() {
  if (!candidateText || !candidateText.classList.contains("code-matrix")) return;
  if (typeof getResponsiveLineCount !== "function" || typeof fitCodeMatrixFont !== "function") return;

  const lineCount = getResponsiveLineCount();
  requestAnimationFrame(() => fitCodeMatrixFont(lineCount));
}

window.addEventListener("resize", () => {
  window.clearTimeout(window.__prescriptResizeTimer);
  window.__prescriptResizeTimer = window.setTimeout(resizeCodeMatrixToTerminal, 80);
});

window.addEventListener("orientationchange", () => {
  window.setTimeout(resizeCodeMatrixToTerminal, 180);
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

receiveButton.addEventListener("click", receivePrescript);
retryButton.addEventListener("click", receivePrescript);

completeButton.addEventListener("click", () => {
  if (!currentHistoryId) return;
  const entry = history.find((item) => item.id === currentHistoryId);
  if (!entry) return;

  entry.done = true;
  saveState();
  renderHistory();
  completeButton.textContent = "遂行済み";
  completeButton.disabled = true;
  playCompleteSound();
});

settingsButton.addEventListener("click", () => {
  renderCommands();
  commandDialog.showModal();
});

addCommandButton.addEventListener("click", addCommand);

commandInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addCommand();
  }
});

resetCommandsButton.addEventListener("click", () => {
  commands = structuredClone(defaultCommands);
  saveState();
  renderCommands();
  updateCounts();
});

clearHistoryButton.addEventListener("click", () => {
  if (history.length === 0) return;
  if (!confirm("受領記録をすべて消去しますか？")) return;

  history = [];
  currentHistoryId = null;
  saveState();
  renderHistory();
  updateCounts();
});

updateCounts();
renderHistory();
renderCommands();


if (soundButton) {
  soundButton.addEventListener("click", () => {
    const next = !soundEnabled;
    if (next) {
      soundEnabled = true;
      ensureAudio();
      playButtonClick();
      setSoundEnabled(true);
    } else {
      playButtonClick();
      setTimeout(() => setSoundEnabled(false), 35);
    }
  });
}

[settingsButton, addCommandButton, resetCommandsButton, clearHistoryButton].forEach((button) => {
  button?.addEventListener("click", playButtonClick);
});

updateSoundButton();
