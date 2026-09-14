// Per-command weighted probability extension for PRESCRIPT TERMINAL
(() => {
  const STORAGE_WEIGHTS = "prescript_weights_v1";
  const STORAGE_ACTIVE_PRESET = "prescript_active_preset_v1";

  function readWeightStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_WEIGHTS) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  let weightStore = readWeightStore();

  function activePresetId() {
    return localStorage.getItem(STORAGE_ACTIVE_PRESET) || "legacy-main";
  }

  function currentWeights() {
    const id = activePresetId();
    if (!Array.isArray(weightStore[id])) weightStore[id] = [];
    const weights = weightStore[id];
    while (weights.length < commands.length) weights.push(1);
    if (weights.length > commands.length) weights.length = commands.length;
    for (let i = 0; i < weights.length; i++) {
      const value = Number(weights[i]);
      weights[i] = Number.isFinite(value) && value >= 0 ? value : 1;
    }
    return weights;
  }

  function saveWeights() {
    currentWeights();
    localStorage.setItem(STORAGE_WEIGHTS, JSON.stringify(weightStore));
  }

  function actualProbabilities(weights) {
    const total = weights.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    if (weights.length === 0) return [];
    if (total <= 0) return weights.map(() => 100 / weights.length);
    return weights.map(value => Math.max(0, Number(value) || 0) / total * 100);
  }

  // Replace uniform drawing with weighted drawing. A weight of 0 disables that item
  // unless every item is 0, in which case drawing falls back to equal probability.
  randomCommand = function () {
    if (!commands.length) return undefined;
    const weights = currentWeights();
    const total = weights.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    if (total <= 0) return commands[Math.floor(Math.random() * commands.length)];

    let roll = Math.random() * total;
    for (let i = 0; i < commands.length; i++) {
      roll -= Math.max(0, Number(weights[i]) || 0);
      if (roll < 0) return commands[i];
    }
    return commands[commands.length - 1];
  };

  renderCommandList = function () {
    const list = document.getElementById("commandList");
    if (!list) return;
    list.innerHTML = "";

    const weights = currentWeights();
    const probabilities = actualProbabilities(weights);

    if (commands.length === 0) {
      list.innerHTML = '<div class="empty-state">このプリセットには指令がありません。</div>';
      saveWeights();
      return;
    }

    commands.forEach((command, index) => {
      const item = document.createElement("div");
      item.className = "command-item probability-command-item";

      const main = document.createElement("div");
      main.className = "probability-command-main";

      const text = document.createElement("span");
      text.className = "probability-command-text";
      text.textContent = command;

      const controls = document.createElement("div");
      controls.className = "probability-controls";

      const probability = document.createElement("span");
      probability.className = "probability-value";
      probability.textContent = `${probabilities[index].toFixed(probabilities[index] < 10 ? 1 : 0)}%`;
      probability.title = "現在の実際の抽選確率";

      const weightLabel = document.createElement("label");
      weightLabel.className = "weight-control";
      const weightCaption = document.createElement("span");
      weightCaption.textContent = "比率";

      const weightInput = document.createElement("input");
      weightInput.type = "number";
      weightInput.min = "0";
      weightInput.max = "999";
      weightInput.step = "1";
      weightInput.inputMode = "numeric";
      weightInput.value = String(weights[index]);
      weightInput.setAttribute("aria-label", `${command} の抽選比率`);

      weightInput.addEventListener("change", () => {
        const value = Math.max(0, Math.min(999, Number(weightInput.value) || 0));
        currentWeights()[index] = value;
        saveWeights();
        renderCommandList();
      });

      weightLabel.append(weightCaption, weightInput);
      controls.append(probability, weightLabel);
      main.append(text, controls);

      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "削除";
      del.addEventListener("click", () => {
        playButtonClick();
        commands.splice(index, 1);
        currentWeights().splice(index, 1);
        saveState();
        saveWeights();
        renderCommandList();
        updateCounts();
      });

      item.append(main, del);
      list.appendChild(item);
    });

    saveWeights();
  };

  // New commands get the default weight 1 through currentWeights().
  // Resetting commands should also restore equal probability.
  resetCommandsButton?.addEventListener("click", () => {
    setTimeout(() => {
      weightStore[activePresetId()] = commands.map(() => 1);
      saveWeights();
      renderCommandList();
    }, 0);
  }, true);

  // Keep the displayed percentages current after preset switches / additions.
  commandDialog?.addEventListener("click", () => {
    requestAnimationFrame(() => {
      currentWeights();
      saveWeights();
    });
  });

  renderCommandList();
  saveWeights();
})();
