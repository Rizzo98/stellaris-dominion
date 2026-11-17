/* ============================================================
   TOAST — short-lived feedback message
   ============================================================ */

let toastTimer = null;

function hideToast() {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  if (els.toast) els.toast.classList.remove("show");
}

function toast(message) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    els.toast.classList.remove("show");
  }, 2100);
}
