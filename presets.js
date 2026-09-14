// Command preset extension for PRESCRIPT TERMINAL
(() => {
  // PC page only: restore normal document scrolling. The shared stylesheet
  // disables overscroll for the PWA/iPhone experience, so override it here.
  if (!/\/iphone\.html$/i.test(window.location.pathname)) {
    const pcScrollStyle = document.createElement("style");
    pcScrollStyle.textContent = `
      html, body {
        height: auto !important;
        min-height: 100% !important;
        overflow-y: auto !important;
        overscroll-behavior-y: auto !important;
      }
      body { min-height: 100vh !important; }
      .app-shell { min-height: 100vh; }
    `;
    document.head.appendChild(pcScrollStyle);
  }

  const STORAGE_PRESETS = "prescript_presets_v1";
  const STORAGE_ACTIVE_PRESET = "prescript_active_preset_v1";

  function makeId() {
    return (crypto.randomUUID ? crypto.randomUUID() : `preset-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  }

  function readPresets() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_PRESETS) || "null");
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {}
    return null;
  }

  let presets = readPresets();
  if (!presets) {
    presets = [{ id: makeId(), name: "メイン", commands: structuredClone(commands) }];
    localStorage.setItem(STORAGE_PRESETS, JSON.stringify(presets));
  }

  let activePresetId = localStorage.getItem(STORAGE_ACTIVE_PRESET);
  if (!presets.some(p => p.id === activePresetId)) activePresetId = presets[0].id;
  localStorage.setItem(STORAGE_ACTIVE_PRESET, activePresetId);

  function activePreset() {
    return presets.find(p => p.id === activePresetId) || presets[0];
  }

  function persistPresets() {
    localStorage.setItem(STORAGE_PRESETS, JSON.stringify(presets));
    localStorage.setItem(STORAGE_ACTIVE_PRESET, activePresetId);
  }

  function syncCommandsIntoActivePreset() {
    const preset = activePreset();
    if (preset) preset.commands = structuredClone(commands);
    persistPresets();
  }

  const originalSaveState = saveState;
  saveState = function () {
    originalSaveState();
    syncCommandsIntoActivePreset();
  };

  commands = structuredClone(activePreset().commands || []);
  originalSaveState();

  const dialogCard = commandDialog?.querySelector(".dialog-card");
  const inputRow = commandDialog?.querySelector(".input-row");
  if (!dialogCard || !inputRow) return;

  const presetPanel = document.createElement("section");
  presetPanel.className = "preset-panel";
  presetPanel.innerHTML = `
    <div class="preset-heading">
      <div>
        <p class="small-label">COMMAND PRESET</p>
        <strong>抽選プリセット</strong>
      </div>
      <span id="presetCommandCount" class="preset-count"></span>
    </div>
    <div class="preset-switch-row">
      <select id="presetSelect" aria-label="抽選プリセット"></select>
      <button id="deletePresetButton" type="button" class="secondary-button compact">削除</button>
    </div>
    <div class="preset-create-row">
      <input id="presetNameInput" type="text" maxlength="30" placeholder="新しいプリセット名" autocomplete="off" />
      <button id="addPresetButton" type="button" class="primary-button compact">作成</button>
    </div>
  `;
  dialogCard.insertBefore(presetPanel, inputRow);

  const presetSelect = presetPanel.querySelector("#presetSelect");
  const presetNameInput = presetPanel.querySelector("#presetNameInput");
  const addPresetButton = presetPanel.querySelector("#addPresetButton");
  const deletePresetButton = presetPanel.querySelector("#deletePresetButton");
  const presetCommandCount = presetPanel.querySelector("#presetCommandCount");

  function renderPresetControls() {
    presetSelect.innerHTML = "";
    presets.forEach(preset => {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.name;
      option.selected = preset.id === activePresetId;
      presetSelect.appendChild(option);
    });
    const current = activePreset();
    presetCommandCount.textContent = `${current?.commands?.length || 0} COMMANDS`;
    deletePresetButton.disabled = presets.length <= 1;
  }

  function switchPreset(nextId) {
    syncCommandsIntoActivePreset();
    const next = presets.find(p => p.id === nextId);
    if (!next) return;
    activePresetId = next.id;
    commands = structuredClone(next.commands || []);
    originalSaveState();
    persistPresets();
    renderCommandList();
    updateCounts();
    renderPresetControls();
  }

  presetSelect.addEventListener("change", () => {
    playButtonClick();
    switchPreset(presetSelect.value);
  });

  addPresetButton.addEventListener("click", () => {
    playButtonClick();
    const name = presetNameInput.value.trim();
    if (!name) return;
    const preset = { id: makeId(), name, commands: [] };
    presets.push(preset);
    presetNameInput.value = "";
    activePresetId = preset.id;
    commands = [];
    originalSaveState();
    persistPresets();
    renderCommandList();
    updateCounts();
    renderPresetControls();
  });

  presetNameInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      addPresetButton.click();
    }
  });

  deletePresetButton.addEventListener("click", () => {
    if (presets.length <= 1) return;
    playButtonClick();
    const current = activePreset();
    if (!current) return;
    const ok = confirm(`プリセット「${current.name}」を削除しますか？`);
    if (!ok) return;
    const index = presets.findIndex(p => p.id === current.id);
    presets.splice(index, 1);
    const fallback = presets[Math.max(0, index - 1)] || presets[0];
    activePresetId = fallback.id;
    commands = structuredClone(fallback.commands || []);
    originalSaveState();
    persistPresets();
    renderCommandList();
    updateCounts();
    renderPresetControls();
  });

  commandDialog.addEventListener("click", () => requestAnimationFrame(renderPresetControls));

  renderPresetControls();
  renderCommandList();
  updateCounts();
})();
