/* ============================================================
   EVENT CARD — rendering and resolving encounter choices
   ============================================================ */

let eventResolveTimer = null;

function twoChoiceSideHTML(choice, index) {
  const lock = getChoiceLockReason(choice);
  const side = index === 0 ? "left" : "right";
  const direction = index === 0 ? "◀ A" : "B ▶";
  return (
    '<div class="event-choice-side ' + side + (lock ? " locked" : "") + '">' +
      '<span class="choice-arrow">' + direction + "</span>" +
      '<span class="choice-name">' + choice.label + "</span>" +
      (choice.tag ? '<span class="choice-tag">[' + choice.tag.toUpperCase() + "]</span>" : "") +
      (lock ? '<span class="choice-lock">🔒 ' + lock + "</span>" : "") +
    "</div>"
  );
}

function previewHTML(choice, index) {
  const lock = getChoiceLockReason(choice);
  const direction = index === 0 ? "CHOICE A · SWIPE LEFT" : "CHOICE B · SWIPE RIGHT";
  return (
    '<div class="preview-eyebrow">' + direction + "</div>" +
    '<div class="preview-title">' + choice.label + "</div>" +
    '<div class="preview-effects">' + renderEffectPills(choice.effects) + "</div>" +
    (lock ? '<div class="preview-lock">🔒 ' + lock + "</div>" : "")
  );
}

function updateSwipePreview(side) {
  els.previewLeft.classList.toggle("show", side === "left");
  els.previewRight.classList.toggle("show", side === "right");
}

function resetSwipeCard() {
  if (eventResolveTimer) {
    clearTimeout(eventResolveTimer);
    eventResolveTimer = null;
  }
  swipeConfirming = false;
  eventDrag = null;
  updateSwipePreview(null);
  els.eventCard.classList.remove("dragging", "flying");
  els.eventCard.style.transform = "";
  els.eventCard.style.opacity = "1";
}

function renderEventCard(event) {
  resetSwipeCard();
  state.ui.eventResolving = false;
  els.eventTurn.textContent = "TURN " + state.turn;
  const category = getEventCategory(event);
  if (els.eventCategory) {
    els.eventCategory.textContent = category
      ? category.emoji + " " + category.name.toUpperCase()
      : "ENCOUNTER";
    els.eventCategory.className = "event-category" + (category ? " cat-" + category.id : "");
  }
  els.eventEmoji.textContent = event.emoji;
  els.eventKicker.textContent = event.kicker;
  els.eventTitle.textContent = event.title;
  els.eventCopy.textContent = event.text;
  els.previewLeft.innerHTML = "";
  els.previewRight.innerHTML = "";

  const isTwo = event.choices.length === 2;
  els.swipeChoices.classList.toggle("hidden", !isTwo);
  els.swipeInstruction.classList.toggle("hidden", !isTwo);
  els.eventButtons.classList.toggle("hidden", isTwo);
  els.eventInstruction.classList.toggle("buttons-mode", !isTwo);

  if (isTwo) {
    els.swipeChoices.innerHTML = event.choices.map(function (choice, index) {
      return twoChoiceSideHTML(choice, index);
    }).join("");
    els.previewLeft.innerHTML = previewHTML(event.choices[0], 0);
    els.previewRight.innerHTML = previewHTML(event.choices[1], 1);
    els.previewLeft.classList.toggle("locked", !!getChoiceLockReason(event.choices[0]));
    els.previewRight.classList.toggle("locked", !!getChoiceLockReason(event.choices[1]));
    els.eventInstruction.innerHTML = '<span class="arrow">◀</span> swipe left for A · swipe right for B <span class="arrow">▶</span>';
    els.eventButtons.innerHTML = "";
  } else {
    const buttons = [];
    event.choices.forEach(function (choice, index) {
      const lock = getChoiceLockReason(choice);
      buttons.push(
        '<button class="choice-button" data-choice="' + index + '"' + (lock ? " disabled" : "") + ">" +
          '<span class="choice-main">' +
            '<span class="choice-title">' + choice.label + "</span>" +
            '<span class="choice-sub">' +
              (choice.tag ? '<span class="choice-tag">[' + choice.tag.toUpperCase() + "]</span>" : "") +
              (lock ? '<span class="choice-lock">🔒 ' + lock + "</span>" : '<span>SELECT RESPONSE</span>') +
            "</span>" +
          "</span>" +
          '<span class="choice-effects">' + renderEffectPills(choice.effects) + "</span>" +
        "</button>"
      );
    });
    els.eventButtons.innerHTML = buttons.join("");
    els.swipeChoices.innerHTML = "";
    els.previewLeft.innerHTML = "";
    els.previewRight.innerHTML = "";
    els.eventInstruction.textContent = "Choose one response. Locked options stay visible.";
  }
  els.eventCard.scrollTop = 0;
}

function showEventLayer() {
  if (!state.currentEvent || state.phase !== "event") return;
  state.ui.eventResolving = false;
  renderEventCard(state.currentEvent);
  els.eventLayer.classList.remove("hidden", "leaving");
}

function hideEventLayer() {
  resetSwipeCard();
  els.eventLayer.classList.add("hidden");
  els.eventLayer.classList.remove("leaving");
}

function resolveEvent(choiceIndex) {
  if (state.phase !== "event" || !state.currentEvent || state.ui.eventResolving) return;
  const event = state.currentEvent;
  const choice = event.choices[choiceIndex];
  if (!choice) return;
  const lockReason = getChoiceLockReason(choice);
  if (lockReason) {
    toast("Locked: " + lockReason);
    return;
  }
  state.ui.eventResolving = true;
  state.currentEvent = null;
  hideEventLayer();
  state.phase = "actions";
  applyEffects(choice.effects);
  state.ui.eventResolving = false;
  if (state.phase === "ended") return;
  if (state.stability <= 0) {
    endGame("stability");
    return;
  }
  renderAll();
}
