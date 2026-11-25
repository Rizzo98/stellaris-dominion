/* ============================================================
   TECH VIEW — research banner, category switch and tech cards
   The directorate is split into three categories (Buildings, Military,
   Trade & Exploration). Each category groups its techs by the thing they
   upgrade, and the final project is pinned below every category.
   ============================================================ */

function getActiveTechCategory() {
  const wanted = state && state.ui ? state.ui.techCategory : null;
  const match = TECH_CATEGORIES.find(function (category) { return category.id === wanted; });
  return match ? match.id : TECH_CATEGORIES[0].id;
}

function setActiveTechCategory(categoryId) {
  const known = TECH_CATEGORIES.some(function (category) { return category.id === categoryId; });
  if (!known) return false;
  if (state.ui.techCategory === categoryId) return false;
  state.ui.techCategory = categoryId;
  renderTechView();
  return true;
}

/* Tech ids of one category, in TECH_ORDER (group, then tier). */
function getCategoryTechIds(categoryId) {
  return TECH_ORDER.filter(function (id) {
    return TECHS[id] && TECHS[id].category === categoryId;
  });
}

function getGroupTechIds(groupId) {
  return TECH_ORDER.filter(function (id) {
    return TECHS[id] && TECHS[id].group === groupId;
  });
}

function countCompletedTechs(ids) {
  return ids.filter(function (id) { return hasTech(id); }).length;
}

/* Why a researched refit may still be waiting on an asset. The card explains
   the manual step so the category text and the colony/fleet buttons agree. */
function techRefitNote(tech, done) {
  if (!done) return "";
  if (tech.building && BUILDINGS[tech.building]) {
    return "Unlocked. A standing " + BUILDINGS[tech.building].name +
      " keeps its old output until you refit it on the colony screen, and the colony must" +
      " already support the new level's minimum population.";
  }
  if (tech.shipType && SHIP_TYPES[tech.shipType]) {
    return "Unlocked. Standing " + SHIP_TYPES[tech.shipType].name +
      "s keep their old stats until a spaceport in their sector refits them.";
  }
  return "";
}

function techCategoryTabHTML(category) {
  const ids = getCategoryTechIds(category.id);
  const done = countCompletedTechs(ids);
  const active = getActiveTechCategory() === category.id;
  const activeTechId = state.tech.active;
  const runningHere = activeTechId && TECHS[activeTechId] && TECHS[activeTechId].category === category.id;
  return (
    '<button class="tech-category' + (active ? " active" : "") + (runningHere ? " running" : "") + '"' +
      ' type="button" role="tab" aria-selected="' + (active ? "true" : "false") + '"' +
      ' data-tech-category="' + category.id + '">' +
      '<span class="tech-category-emoji" aria-hidden="true">' + category.emoji + '</span>' +
      '<span class="tech-category-main">' +
        '<span class="tech-category-name">' + category.label + '</span>' +
        '<span class="tech-category-meta">' + done + " / " + ids.length + ' COMPLETE' +
          (runningHere ? " · ACTIVE PROJECT" : "") + '</span>' +
      '</span>' +
    '</button>'
  );
}

function techCardHTML(id) {
  const tech = TECHS[id];
  if (!tech) return "";
  const done = hasTech(id);
  const active = state.tech.active === id;
  const lockReason = techLockReason(id);
  const progress = done ? tech.cost : (state.tech.progress[id] || 0);
  const statusClass = done ? "done" : active ? "active" : lockReason ? "locked" : "";
  const metaParts = [tech.cost + " 🔬"];
  if (!done) metaParts.push("⚡ " + getTechEnergyUpkeep(id) + " UPKEEP");
  if (tech.tier) metaParts.push("TIER " + ["I", "II", "III"][tech.tier - 1]);
  if (tech.exclusive) metaParts.push("MUTUALLY EXCLUSIVE");
  if (tech.requiresTechs) metaParts.push("REQUIRES " + tech.requiresTechs + " TECHS");
  if (tech.final) metaParts.push("FINAL PROJECT");

  const cards = [];
  cards.push('<article class="tech-card ' + statusClass + '">');
  cards.push(
    '<div class="tech-head">' +
      '<span class="tech-emoji" aria-hidden="true">' + tech.emoji + "</span>" +
      '<div class="tech-title-wrap">' +
        "<h3>" + tech.name + "</h3>" +
        '<span class="tech-meta">' + metaParts.join(" · ") + "</span>" +
      "</div>" +
      '<span class="tech-state ' + (done ? "done" : active ? "active" : lockReason ? "locked" : "") + '">' +
        (done ? "COMPLETE" : active ? "ACTIVE" : lockReason ? "LOCKED" : "READY") +
      "</span>" +
    "</div>"
  );
  cards.push('<p class="tech-effect">' + tech.effect + "</p>");
  if (tech.detail) cards.push('<p class="tech-detail">' + tech.detail + "</p>");
  const refitNote = techRefitNote(tech, done);
  if (refitNote) cards.push('<p class="tech-refit-note">🔧 ' + refitNote + "</p>");

  if (active || progress > 0) {
    const percent = clamp((progress / tech.cost) * 100, 0, 100);
    cards.push(
      '<div class="tech-progress">' +
        '<div class="tech-progress-head"><span>PROGRESS</span><span><b>' + progress + "</b> / " + tech.cost + "</span></div>" +
        '<div class="progress-track"><div class="progress-fill" style="width:' + percent.toFixed(1) + '%"></div></div>' +
      "</div>"
    );
  }

  cards.push('<div class="tech-footer">');
  if (lockReason) {
    cards.push('<span class="tech-lock-reason">🔒 ' + lockReason + "</span>");
    cards.push('<button class="tech-button" disabled>LOCKED</button>');
  } else if (done) {
    cards.push('<span class="tech-lock-reason text-good">Researched</span>');
    cards.push('<button class="tech-button done" disabled>COMPLETE</button>');
  } else if (active) {
    cards.push('<span class="tech-lock-reason">Points auto-invested</span>');
    cards.push('<button class="tech-button active" disabled>RESEARCHING</button>');
  } else {
    cards.push('<span class="tech-lock-reason">No action cost</span>');
    cards.push('<button class="tech-button" data-tech="' + id + '">RESEARCH</button>');
  }
  cards.push("</div>");
  cards.push("</article>");
  return cards.join("");
}

function techGroupHTML(groupId) {
  const group = TECH_GROUPS[groupId];
  if (!group) return "";
  const ids = getGroupTechIds(groupId);
  if (!ids.length) return "";
  const done = countCompletedTechs(ids);
  const open = ids.some(function (id) { return state.tech.active === id; });
  return (
    '<section class="tech-group" aria-label="' + group.name + '">' +
      '<div class="tech-group-head">' +
        '<span class="tech-group-emoji" aria-hidden="true">' + group.emoji + "</span>" +
        '<span class="tech-group-name">' + group.name.toUpperCase() + "</span>" +
        '<span class="tech-group-count' + (done === ids.length ? " done" : open ? " running" : "") + '">' +
          done + " / " + ids.length + "</span>" +
      "</div>" +
      (group.hint ? '<p class="tech-group-hint">' + group.hint + "</p>" : "") +
      '<div class="tech-group-body">' + ids.map(techCardHTML).join("") + "</div>" +
    "</section>"
  );
}

function renderTechView() {
  const econ = getEconomy();
  const activeTech = state.tech.active ? TECHS[state.tech.active] : null;
  const categoryId = getActiveTechCategory();
  const category = TECH_CATEGORIES.find(function (entry) { return entry.id === categoryId; });
  const banner = [];

  banner.push(
    '<div class="banner-top">' +
      '<span class="banner-label">RESEARCH STOCKPILE</span>' +
      '<span class="banner-value">🔬 ' + state.resources.research + " · " + formatSigned(econ.income.research) + "/TURN</span>" +
    "</div>"
  );
  if (activeTech) {
    const progress = state.tech.progress[activeTech.id];
    const upkeep = getTechEnergyUpkeep(activeTech.id);
    banner.push('<div class="active-line">ACTIVE · ' + activeTech.name +
      '<span class="tech-upkeep">⚡ ' + upkeep + " / TURN</span></div>");
    const activeCategory = TECH_CATEGORIES.find(function (entry) { return entry.id === activeTech.category; });
    const elsewhere = activeCategory && activeCategory.id !== categoryId
      ? " It sits under " + activeCategory.label + "."
      : "";
    banner.push(
      '<div class="banner-note">' + progress + " / " + activeTech.cost +
      " points invested. This project draws " + upkeep + " energy upkeep from the capital sector each turn until it completes. New research flows here automatically. Starting another project pauses this one." +
      elsewhere + "</div>"
    );
  } else {
    banner.push('<div class="active-line">NO ACTIVE PROJECT</div>');
    banner.push('<div class="banner-note">Research is banked until you start a project. Starting has no action cost, but an active project adds an energy upkeep on the capital sector each turn.</div>');
  }
  els.researchBanner.innerHTML = banner.join("");

  const parts = [];
  parts.push('<div class="tech-categories" role="tablist" aria-label="Tech categories">' +
    TECH_CATEGORIES.map(techCategoryTabHTML).join("") + "</div>");

  if (category) {
    parts.push(
      '<div class="tech-category-intro">' +
        '<span class="tech-category-kicker">' + category.kicker + "</span>" +
        '<p class="tech-category-blurb">' + category.blurb + "</p>" +
      "</div>"
    );
  }

  const groupIds = TECH_GROUP_ORDER.filter(function (groupId) {
    const group = TECH_GROUPS[groupId];
    return group && group.category === categoryId;
  });
  const body = groupIds.map(techGroupHTML).join("");
  parts.push('<div class="tech-group-list">' + (body || '<div class="tech-empty">No technologies in this category.</div>') + "</div>");

  /* The three categories are the whole tab: no project is pinned below them. */
  els.techList.innerHTML = parts.join("");
}
