/* ============================================================
   SWIPE GESTURE — drag the event card left/right to decide
   ============================================================ */

let eventDrag = null;
let swipeConfirming = false;

function beginCardDrag(event) {
  if (state.phase !== "event" || !state.currentEvent || swipeConfirming) return;
  if (state.currentEvent.choices.length !== 2) return;
  if (state.ui.eventResolving) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  eventDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    dx: 0,
    dy: 0
  };
  els.eventCard.classList.add("dragging");
  try {
    els.eventCard.setPointerCapture(event.pointerId);
  } catch (err) {
    // Pointer capture is a convenience, not a requirement.
  }
}

function moveCardDrag(event) {
  if (!eventDrag || event.pointerId !== eventDrag.pointerId) return;
  const dx = event.clientX - eventDrag.startX;
  const dy = event.clientY - eventDrag.startY;
  eventDrag.dx = dx;
  eventDrag.dy = dy;
  const rotation = clamp(dx / 22, -12, 12);
  const lift = clamp(dy * 0.24, -22, 22);
  els.eventCard.style.transform = "translate3d(" + dx + "px," + lift + "px,0) rotate(" + rotation + "deg)";
  let side = null;
  if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 0.55) {
    side = dx < 0 ? "left" : "right";
  }
  updateSwipePreview(side);
}

function snapCardBack() {
  els.eventCard.classList.remove("dragging");
  els.eventCard.style.transform = "";
  els.eventCard.style.opacity = "1";
  updateSwipePreview(null);
}

function finishCardDrag(event) {
  if (!eventDrag || event.pointerId !== eventDrag.pointerId) return;
  const drag = eventDrag;
  eventDrag = null;
  const dx = drag.dx;
  const dy = drag.dy;
  const threshold = CONFIG.swipeThreshold;
  const shouldChoose = Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.15;
  els.eventCard.classList.remove("dragging");

  if (!shouldChoose) {
    snapCardBack();
    return;
  }

  const choiceIndex = dx < 0 ? 0 : 1;
  const choice = state.currentEvent.choices[choiceIndex];
  const lockReason = getChoiceLockReason(choice);
  if (lockReason) {
    snapCardBack();
    toast("Locked: " + lockReason);
    return;
  }

  swipeConfirming = true;
  updateSwipePreview(null);
  els.eventCard.classList.add("flying");
  const flyX = dx < 0 ? -window.innerWidth * 1.08 : window.innerWidth * 1.08;
  els.eventCard.style.transform = "translate3d(" + flyX + "px," + (dy * 0.3) + "px,0) rotate(" + (dx < 0 ? -18 : 18) + "deg)";
  els.eventCard.style.opacity = "0";
  const runId = state.runId;
  eventResolveTimer = setTimeout(function () {
    eventResolveTimer = null;
    swipeConfirming = false;
    if (state.runId !== runId || state.phase !== "event" || !state.currentEvent) return;
    resolveEvent(choiceIndex);
  }, 185);
}

function cancelCardDrag(event) {
  if (!eventDrag || (event && event.pointerId !== eventDrag.pointerId)) return;
  eventDrag = null;
  snapCardBack();
}
