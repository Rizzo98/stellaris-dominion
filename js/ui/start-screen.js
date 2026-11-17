/* ============================================================
   START SCREEN — the ethics picker and galaxy seed control
   ============================================================ */

function normalizeSeedValue(value) {
  const text = String(value || "").trim();
  if (!text) return CONFIG.galaxy.seed;
  if (/^\d+$/.test(text)) return Number(text) >>> 0;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
}

function renderSeedInput() {
  if (!els.seedInput) return;
  els.seedInput.value = String(CONFIG.galaxy.seed);
}

function readSeedInput() {
  if (!els.seedInput) return CONFIG.galaxy.seed;
  const next = normalizeSeedValue(els.seedInput.value);
  CONFIG.galaxy.seed = next;
  els.seedInput.value = String(next);
  return next;
}

function randomizeSeed() {
  CONFIG.galaxy.seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
  renderSeedInput();
}

function renderEthics() {
  const parts = [];
  ETHIC_ORDER.forEach(function (id) {
    const ethic = ETHICS[id];
    const mods = ethic.modifiers.map(function (mod) {
      return '<span class="ethic-mod">' + mod + "</span>";
    }).join("");
    parts.push(
      '<button class="ethic-card" data-ethic="' + ethic.id + '" style="--ethic-color:' + ethic.color + '" aria-label="Choose ' + ethic.name + ' ethic">' +
        '<span class="ethic-emoji" aria-hidden="true">' + ethic.emoji + "</span>" +
        '<span class="ethic-main">' +
          '<span class="ethic-name">' + ethic.name + "</span>" +
          '<span class="ethic-blurb">' + ethic.blurb + "</span>" +
          '<span class="ethic-mods">' + mods + "</span>" +
        "</span>" +
        '<span class="ethic-chevron" aria-hidden="true">›</span>' +
      "</button>"
    );
  });
  els.ethicsList.innerHTML = parts.join("");
  renderSeedInput();
}
