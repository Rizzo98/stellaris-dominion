/* ============================================================
   LONG PRESS — one shared gesture layer for the delegated tap handlers
   Every interactive surface in this app is a delegated click handler keyed
   on a data-* attribute. A hold adds a second, slower channel to the same
   container: pointerdown starts a timer, drifting past CONFIG.hold.slop (or
   a touch scroll's pointercancel) abandons it, and a fired hold swallows the
   click the browser still delivers on release.

   bindLongPress(container, selector, onHold) resolves the target exactly the
   way the click handler does — event.target.closest(selector) — so a hold
   and a tap never disagree about what was pressed. onHold may return false
   to decline the gesture, in which case the coming click is left alone: a
   long press must never steal the tap it was meant to accelerate.
   ============================================================ */

/* Ring geometry is shared with the CSS in css/utilities.css. */
const HOLD_RING_RADIUS = 19;
const HOLD_RING_CIRCUMFERENCE = 2 * Math.PI * HOLD_RING_RADIUS;
const HOLD_RING_OFFSET = 36;      // px above the finger, so the tip stays visible
const HOLD_RING_REVEAL_MS = 120;  // quick taps never flash the ring
const HOLD_CLICK_WINDOW_MS = 900; // how long the release click stays swallowed

let holdPending = null;
let holdClickGuard = 0;
let holdFiredPointer = null;
let holdRingEl = null;

function ensureHoldRing() {
  if (holdRingEl && document.body.contains(holdRingEl)) return holdRingEl;
  holdRingEl = document.createElement("div");
  holdRingEl.id = "hold-ring";
  holdRingEl.setAttribute("aria-hidden", "true");
  holdRingEl.innerHTML =
    '<svg viewBox="0 0 44 44" aria-hidden="true">' +
      '<circle class="hold-ring-track" cx="22" cy="22" r="' + HOLD_RING_RADIUS + '"></circle>' +
      '<circle class="hold-ring-fill" cx="22" cy="22" r="' + HOLD_RING_RADIUS + '"></circle>' +
    "</svg>";
  document.body.appendChild(holdRingEl);
  return holdRingEl;
}

/* The fill is a stroke that closes over the remaining hold time, so the
   player can see the press registering without covering the hex. */
function showHoldRing(x, y, durationMs) {
  const ring = ensureHoldRing();
  const fill = ring.querySelector(".hold-ring-fill");
  ring.style.left = x + "px";
  ring.style.top = (y - HOLD_RING_OFFSET) + "px";
  ring.classList.add("on");
  if (!fill) return;
  fill.style.transition = "none";
  fill.style.strokeDashoffset = String(HOLD_RING_CIRCUMFERENCE);
  void fill.getBoundingClientRect();
  fill.style.transition = "stroke-dashoffset " + Math.max(120, durationMs) + "ms linear";
  fill.style.strokeDashoffset = "0";
}

function hideHoldRing() {
  if (holdRingEl) holdRingEl.classList.remove("on");
}

/* The pressed element can be repainted away by renderAll() mid-hold, so the
   move/up listeners live on the document rather than on the container. */
function holdDetach(hold) {
  if (!hold) return;
  document.removeEventListener("pointermove", hold.onMove, true);
  document.removeEventListener("pointerup", hold.onEnd, true);
  document.removeEventListener("pointercancel", hold.onEnd, true);
}

function cancelHold() {
  if (!holdPending) return;
  const hold = holdPending;
  holdPending = null;
  clearTimeout(hold.timer);
  clearTimeout(hold.reveal);
  holdDetach(hold);
  hideHoldRing();
}

function bindLongPress(container, selector, onHold, options) {
  if (!container) return;
  const settings = options || {};
  const delay = typeof settings.delayMs === "number" ? settings.delayMs : CONFIG.hold.delayMs;
  const slop = typeof settings.slop === "number" ? settings.slop : CONFIG.hold.slop;

  container.addEventListener("pointerdown", function (event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target.closest ? event.target.closest(selector) : null;
    if (!target) return;
    cancelHold();

    const hold = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      target: target,
      timer: 0,
      reveal: 0,
      onMove: null,
      onEnd: null
    };

    hold.onMove = function (moveEvent) {
      if (holdPending !== hold || moveEvent.pointerId !== hold.pointerId) return;
      if (Math.abs(moveEvent.clientX - hold.startX) > slop ||
          Math.abs(moveEvent.clientY - hold.startY) > slop) {
        cancelHold();
      }
    };
    hold.onEnd = function (endEvent) {
      if (holdPending !== hold || endEvent.pointerId !== hold.pointerId) return;
      cancelHold();
    };

    hold.timer = setTimeout(function () {
      if (holdPending !== hold) return;
      holdPending = null;
      holdDetach(hold);
      hideHoldRing();
      const consumed = onHold(target, event);
      if (consumed === false) return;
      /* The click arrives after the release, which can be seconds after a long
         hold. Arm the guard now for the immediate cases and re-arm it on
         pointerup, so a slow release is still covered. */
      holdClickGuard = performance.now() + HOLD_CLICK_WINDOW_MS;
      holdFiredPointer = event.pointerId;
      if (navigator.vibrate) {
        try { navigator.vibrate(8); } catch (err) { /* haptics are a nicety */ }
      }
    }, delay);

    hold.reveal = setTimeout(function () {
      if (holdPending !== hold) return;
      showHoldRing(hold.startX, hold.startY, delay - HOLD_RING_REVEAL_MS);
    }, HOLD_RING_REVEAL_MS);

    holdPending = hold;
    document.addEventListener("pointermove", hold.onMove, true);
    document.addEventListener("pointerup", hold.onEnd, true);
    document.addEventListener("pointercancel", hold.onEnd, true);
  }, { passive: true });

  /* A long press on a touch device can still raise the native selection or
     callout menu before the timer fires; base.css turns the callout off and
     this keeps the context menu out of the gesture as well. */
  container.addEventListener("contextmenu", function (event) {
    if (holdPending || holdClickGuard > performance.now()) event.preventDefault();
  });
}

/* A new press is always a new gesture: any click the previous hold was
   guarding has already been delivered or was never coming (a repaint can
   replace the pressed node, and then the browser drops the click). */
document.addEventListener("pointerdown", function () {
  if (holdClickGuard) holdClickGuard = 0;
}, true);

/* Re-arm the guard at release: a hold that lasts several seconds still ends
   with the click it has to swallow, and a release that never produces one
   lets the guard expire in under a second. */
document.addEventListener("pointerup", function (event) {
  if (!holdFiredPointer || event.pointerId !== holdFiredPointer) return;
  holdFiredPointer = null;
  holdClickGuard = performance.now() + HOLD_CLICK_WINDOW_MS;
}, true);
document.addEventListener("pointercancel", function (event) {
  if (!holdFiredPointer || event.pointerId !== holdFiredPointer) return;
  holdFiredPointer = null;
  holdClickGuard = performance.now() + HOLD_CLICK_WINDOW_MS;
}, true);

/* Capture phase: the delegated bubble handlers never see the click that
   follows a consumed hold. The window also expires, so a lost click can
   never swallow the next real tap. */
document.addEventListener("click", function (event) {
  if (!holdClickGuard) return;
  if (performance.now() > holdClickGuard) {
    holdClickGuard = 0;
    return;
  }
  holdClickGuard = 0;
  event.stopPropagation();
  event.preventDefault();
}, true);
