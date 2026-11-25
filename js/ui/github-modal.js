/* ============================================================
   GITHUB WINDOW — the one modal behind PUSH TO REMOTE and REPORT
   The window has two modes that share the sign-in card:

     push    publish the live rulebook as js/data/standard-rules.js
     report  write a free-text GitHub issue with the run's context

   The window owns its markup, pending/error/success states and the report
   draft. The network writes live in js/game/github-actions.js; the API client
   and payload builders live in js/core/github.js.
   ============================================================ */

let githubModalMode = null;
let githubModalOpener = null;
let githubReportDraft = "";
let githubModalUi = {
  pending: false,
  pendingLabel: "",
  error: "",
  success: null,
  reportText: "",
  includeRules: true
};

/* ---------- small helpers ---------- */

function escapeGithubHTML(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character];
  });
}

function githubSafeUrl(url) {
  return typeof url === "string" && /^https:\/\/github\.com\//.test(url) ? url : null;
}

function githubShortDate(iso) {
  const date = new Date(iso);
  if (!date || !isFinite(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function focusGithubControl(node) {
  if (!node || typeof node.focus !== "function") return;
  try {
    node.focus({ preventScroll: true });
  } catch (error) {
    node.focus();
  }
}

function isGithubModalOpen() {
  return !!els.githubLayer && !els.githubLayer.classList.contains("hidden");
}

function isGithubModalPending() {
  return !!githubModalUi.pending;
}

/* ---------- open / close ---------- */

function openGithubPushModal() {
  return openGithubModal("push");
}

function openGithubReportModal() {
  if (!state || state.phase !== "actions") {
    toast("Reports are available during a playable turn.");
    return false;
  }
  return openGithubModal("report");
}

function openGithubModal(mode) {
  if (!els.githubLayer) {
    toast("The GitHub window is unavailable in this browser.");
    return false;
  }
  githubModalMode = mode === "report" ? "report" : "push";
  githubModalOpener = typeof document !== "undefined" ? document.activeElement : null;
  githubModalUi = {
    pending: false,
    pendingLabel: "",
    error: "",
    success: null,
    reportText: githubReportDraft,
    includeRules: true
  };
  els.githubLayer.classList.remove("hidden");
  els.githubLayer.setAttribute("aria-hidden", "false");
  els.githubLayer.setAttribute("aria-busy", "false");
  renderGithubModal();
  const focusTarget = githubModalMode === "report"
    ? byId("github-report-text")
    : (byId("github-username") || byId("github-submit") || els.githubClose);
  focusGithubControl(focusTarget);
  return true;
}

function closeGithubModal() {
  if (!els.githubLayer || els.githubLayer.classList.contains("hidden")) return false;
  if (githubModalUi.pending) return false;
  const opener = githubModalOpener;
  els.githubLayer.classList.add("hidden");
  els.githubLayer.setAttribute("aria-hidden", "true");
  els.githubLayer.setAttribute("aria-busy", "false");
  if (els.githubBody) els.githubBody.innerHTML = "";
  if (els.githubFoot) els.githubFoot.innerHTML = "";
  githubModalOpener = null;
  githubModalMode = null;
  githubModalUi = {
    pending: false,
    pendingLabel: "",
    error: "",
    success: null,
    reportText: githubReportDraft,
    includeRules: true
  };
  if (opener) focusGithubControl(opener);
  return true;
}

/* ---------- state updates ---------- */

function setGithubModalError(message) {
  githubModalUi.error = message || "";
  const node = byId("github-error");
  if (!node) return;
  node.textContent = githubModalUi.error;
  node.classList.toggle("hidden", !githubModalUi.error);
  if (githubModalUi.error && typeof node.scrollIntoView === "function") {
    try {
      node.scrollIntoView({ block: "nearest" });
    } catch (error) {
      /* Older engines without options still scroll this way. */
      try { node.scrollIntoView(); } catch (ignored) { /* no scroll container */ }
    }
  }
}

function renderGithubFooter() {
  if (!els.githubFoot) return;
  els.githubFoot.innerHTML = githubFooterHTML();
}

function setGithubModalPending(pending, label) {
  githubModalUi.pending = !!pending;
  if (label) githubModalUi.pendingLabel = label;
  if (els.githubLayer) els.githubLayer.setAttribute("aria-busy", pending ? "true" : "false");
  const submit = byId("github-submit");
  if (submit) {
    submit.disabled = !!pending;
    submit.textContent = pending ? (githubModalUi.pendingLabel || "WORKING…") : githubSubmitLabel();
  }
  if (els.githubClose) els.githubClose.disabled = !!pending;
  if (els.githubLayer && typeof els.githubLayer.querySelectorAll === "function") {
    els.githubLayer.querySelectorAll("input, textarea, button").forEach(function (control) {
      if (control === submit) return;
      if (control.getAttribute && control.getAttribute("data-github-allow-busy") !== null) return;
      control.disabled = !!pending;
    });
  }
  if (!pending && !githubModalUi.success) renderGithubFooter();
}

function updateGithubReportPreview() {
  const preview = byId("github-title-preview");
  if (preview) preview.textContent = buildIssueTitle(githubModalUi.reportText);
  const count = byId("github-char-count");
  if (count) count.textContent = githubModalUi.reportText.length + " / " + GITHUB_REPORT_TEXT_LIMIT;
}

/* ---------- render ---------- */

function renderGithubModal() {
  if (!els.githubLayer || !githubModalMode) return;
  if (els.githubLayer) els.githubLayer.setAttribute("aria-busy", githubModalUi.pending ? "true" : "false");
  if (els.githubClose) els.githubClose.disabled = !!githubModalUi.pending;
  const report = githubModalMode === "report";
  if (els.githubKicker) {
    els.githubKicker.textContent = "REPOSITORY · " + getGithubRepoLabel().toUpperCase();
  }
  if (els.githubTitle) els.githubTitle.textContent = report ? "Report a problem" : "Push to remote";
  if (githubModalUi.success) {
    if (els.githubBody) els.githubBody.innerHTML = githubSuccessHTML();
    if (els.githubFoot) els.githubFoot.innerHTML = githubSuccessFooterHTML();
    if (githubModalUi.pending) setGithubModalPending(true, githubModalUi.pendingLabel);
    else if (els.githubFoot && typeof els.githubFoot.querySelector === "function") {
      focusGithubControl(els.githubFoot.querySelector("[data-github-close]"));
    }
    return;
  }
  if (els.githubBody) els.githubBody.innerHTML = report ? githubReportBodyHTML() : githubPushBodyHTML();
  if (els.githubFoot) els.githubFoot.innerHTML = githubFooterHTML();
  if (githubModalUi.pending) setGithubModalPending(true, githubModalUi.pendingLabel);
}

function githubSubmitLabel() {
  const signedIn = !!getGithubSession();
  if (githubModalMode === "report") return signedIn ? "CREATE ISSUE" : "SIGN IN & FILE ISSUE";
  return signedIn ? "PUSH TO REMOTE" : "SIGN IN & PUSH";
}

function githubFooterHTML() {
  return '<button type="button" class="secondary-btn github-cancel" data-github-close>CLOSE</button>' +
    '<button type="submit" class="primary-btn github-submit" id="github-submit" form="github-form">' +
      escapeGithubHTML(githubSubmitLabel()) +
    "</button>";
}

function githubFactHTML(label, value) {
  const text = value === null || value === undefined || value === "" ? "—" : String(value);
  return '<div class="github-fact"><span>' + escapeGithubHTML(label) + "</span><b>" +
    escapeGithubHTML(text) + "</b></div>";
}

function githubErrorHTML() {
  return '<div id="github-error" class="github-error' + (githubModalUi.error ? "" : " hidden") +
    '" role="alert">' + escapeGithubHTML(githubModalUi.error) + "</div>";
}

function githubCredentialsHTML() {
  const session = getGithubSession();
  if (session) {
    return '<div class="github-user">' +
      '<span class="github-user-mark" aria-hidden="true">@</span>' +
      '<span class="github-user-copy"><b>@' + escapeGithubHTML(session.login) + "</b>" +
        "<small>Signed in for this tab</small></span>" +
      '<button type="button" class="github-mini" data-github-signout>SIGN OUT</button>' +
    "</div>";
  }
  return '<div class="github-credentials">' +
    '<div class="github-credentials-head"><span>GITHUB SIGN-IN</span><span>API · api.github.com</span></div>' +
    '<label class="github-field"><span>USERNAME</span>' +
      '<input id="github-username" name="username" type="text" autocomplete="username" spellcheck="false"' +
        ' autocapitalize="off" autocorrect="off" placeholder="your GitHub username">' +
    "</label>" +
    '<label class="github-field"><span>PERSONAL ACCESS TOKEN (PAT)</span>' +
      '<span class="github-token-wrap">' +
        '<input id="github-token" name="token" type="password" autocomplete="off" spellcheck="false"' +
          ' autocapitalize="off" autocorrect="off" placeholder="ghp_… or github_pat_…">' +
        '<button type="button" class="github-token-toggle" data-github-toggle-token' +
          ' aria-label="Show token" aria-pressed="false">SHOW</button>' +
      "</span>" +
    "</label>" +
    '<p class="github-note">Enter your GitHub username and a personal access token — <b>not your GitHub password</b>. ' +
      "The token is sent only to api.github.com, held in this tab until you sign out or reload, and never written " +
      "to a save or browser storage.</p>" +
    '<p class="github-note">Permissions: <b>Contents: Read and write</b> to push · ' +
      "<b>Issues: Read and write</b> to report. A fine-grained token scoped to this repository is best. " +
      '<a class="github-inline-link" href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener">Create one ↗</a></p>' +
  "</div>";
}

function githubFactsSummary() {
  return typeof collectGithubFacts === "function" ? collectGithubFacts() : {};
}

function githubStandardLabel() {
  const meta = typeof getRunStandardMeta === "function" ? getRunStandardMeta() : null;
  if (meta && meta.pushedBy) {
    return "@" + meta.pushedBy + (meta.pushedAt ? " · " + githubShortDate(meta.pushedAt) : "");
  }
  if (typeof isRunStandardActive === "function" && isRunStandardActive()) return "PUBLISHED · NO METADATA";
  return "IN-CODE DEFAULTS";
}

function githubPushBodyHTML() {
  const facts = githubFactsSummary();
  const tweaks = typeof facts.tweaks === "number" ? facts.tweaks : countRuleOverrides();
  const source = facts.live
    ? "LIVE RUN · TURN " + (facts.turn == null ? "—" : facts.turn)
    : "NEW MATCH SETUP";
  return '<form id="github-form" class="github-form" autocomplete="off">' +
    '<div class="github-hero">' +
      '<span class="github-hero-icon" aria-hidden="true">⇧</span>' +
      '<span class="github-hero-copy"><b>PUBLISH THIS RULEBOOK</b>' +
        "<small>Commit the settings you are playing with to the repository.</small></span>" +
    "</div>" +
    '<div class="github-facts">' +
      githubFactHTML("REPO", getGithubRepoLabel()) +
      githubFactHTML("FILE", getGithubTarget().standardPath) +
      githubFactHTML("BRANCH", getGithubTarget().branch) +
      githubFactHTML("STANDARD", githubStandardLabel()) +
      githubFactHTML("CHANGES", tweaks
        ? tweaks + (tweaks === 1 ? " TWEAK" : " TWEAKS") + " SINCE THE STANDARD"
        : "NO TWEAKS SINCE THE STANDARD") +
      githubFactHTML("SOURCE", source) +
    "</div>" +
    '<p class="github-note">This publishes the whole rulebook: every CONFIG value, the event deck and the content ' +
      "tables, including generation settings such as the seed, ring count and planet sizes. The open match is " +
      "unaffected; the published file becomes the default for new matches once the deployed site (or a pulled " +
      "clone) loads it.</p>" +
    githubCredentialsHTML() +
    githubErrorHTML() +
  "</form>";
}

function githubReportBodyHTML() {
  const facts = githubFactsSummary();
  const text = githubModalUi.reportText || "";
  return '<form id="github-form" class="github-form" autocomplete="off">' +
    '<label class="github-field"><span>WHAT HAPPENED</span>' +
      '<textarea id="github-report-text" name="report" rows="6" maxlength="' + GITHUB_REPORT_TEXT_LIMIT + '"' +
        ' placeholder="What did you do, what did you expect, and what happened instead?">' +
        escapeGithubHTML(text) +
      "</textarea>" +
    "</label>" +
    '<div class="github-title-row"><span>ISSUE TITLE</span>' +
      '<b id="github-title-preview">' + escapeGithubHTML(buildIssueTitle(text)) + "</b>" +
      '<small id="github-char-count">' + text.length + " / " + GITHUB_REPORT_TEXT_LIMIT + "</small>" +
    "</div>" +
    '<div class="github-facts">' +
      githubFactHTML("TURN", facts.live ? facts.turn : "—") +
      githubFactHTML("SEED", facts.seed) +
      githubFactHTML("ORIGIN", facts.origin) +
      githubFactHTML("STABILITY", facts.stability) +
      githubFactHTML("TWEAKS", typeof facts.tweaks === "number" ? facts.tweaks : 0) +
    "</div>" +
    '<label class="github-check"><input type="checkbox" id="github-include-rules"' +
      (githubModalUi.includeRules !== false ? " checked" : "") + ">" +
      "<span>Attach the current rulebook as a collapsed details block</span></label>" +
    '<p class="github-note">Turn, seed, origin, stability and rule tweaks are added to the issue automatically. ' +
      "GitHub issues are public: do not paste tokens or personal data.</p>" +
    githubCredentialsHTML() +
    githubErrorHTML() +
  "</form>";
}

function githubSuccessHTML() {
  const success = githubModalUi.success || {};
  if (success.kind === "report") {
    const url = githubSafeUrl(success.url);
    return '<div class="github-success">' +
      '<span class="github-success-icon" aria-hidden="true">✓</span>' +
      "<h3>ISSUE " + (success.number ? "#" + escapeGithubHTML(success.number) + " " : "") + "FILED</h3>" +
      '<p class="github-success-copy">' + escapeGithubHTML(success.title || "The report is on GitHub.") + "</p>" +
      (url ? '<a class="github-link" href="' + escapeGithubHTML(url) + '" target="_blank" rel="noopener">OPEN THE ISSUE ↗</a>' : "") +
      '<p class="github-note">Thanks. The issue carries the run context and, if enabled, the current rulebook. ' +
        "Add a screenshot or save file to the issue on GitHub if it helps.</p>" +
    "</div>";
  }
  const commitUrl = githubSafeUrl(success.commitUrl);
  return '<div class="github-success">' +
    '<span class="github-success-icon" aria-hidden="true">✓</span>' +
    "<h3>STANDARD PUBLISHED</h3>" +
    '<p class="github-success-copy">The rulebook was committed to <b>' +
      escapeGithubHTML(getGithubTarget().branch) + "</b> in " + escapeGithubHTML(getGithubRepoLabel()) + ".</p>" +
    '<div class="github-success-links">' +
      (commitUrl
        ? '<a class="github-link" href="' + escapeGithubHTML(commitUrl) + '" target="_blank" rel="noopener">VIEW COMMIT ↗</a>'
        : '<a class="github-link" href="https://github.com/' + escapeGithubHTML(getGithubRepoLabel()) + '/commits/' +
            escapeGithubHTML(getGithubTarget().branch) + '" target="_blank" rel="noopener">VIEW COMMITS ↗</a>') +
      '<a class="github-link" href="' + escapeGithubHTML(githubStandardFileUrl()) +
        '" target="_blank" rel="noopener">VIEW SETTINGS FILE ↗</a>' +
    "</div>" +
    '<p class="github-note">This tab already uses the pushed rulebook as its standard. Other browsers load it ' +
      "on their next page load after GitHub Pages deploys the commit (Pages can cache a file for a few minutes); " +
      "a local clone picks it up after a git pull.</p>" +
  "</div>";
}

function githubSuccessFooterHTML() {
  return '<button type="button" class="primary-btn github-success-close" data-github-close>CLOSE</button>';
}

/* ---------- delegated controls ---------- */

function handleGithubModalClick(event) {
  if (!event || !event.target) return;
  if (event.target === els.githubBackdrop) {
    closeGithubModal();
    return;
  }
  if (!event.target.closest) return;
  const close = event.target.closest("[data-github-close]");
  if (close) {
    closeGithubModal();
    return;
  }
  const signOut = event.target.closest("[data-github-signout]");
  if (signOut) {
    if (githubModalUi.pending) return;
    clearGithubSession();
    githubModalUi.error = "";
    renderGithubModal();
    focusGithubControl(byId("github-username"));
    return;
  }
  const toggle = event.target.closest("[data-github-toggle-token]");
  if (toggle) {
    const input = byId("github-token");
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.textContent = show ? "HIDE" : "SHOW";
    toggle.setAttribute("aria-label", show ? "Hide token" : "Show token");
    toggle.setAttribute("aria-pressed", show ? "true" : "false");
  }
}

function handleGithubModalInput(event) {
  const target = event && event.target;
  if (!target) return;
  if (target.id === "github-report-text") {
    githubModalUi.reportText = target.value;
    githubReportDraft = target.value;
    updateGithubReportPreview();
  }
  if (githubModalUi.error && target.closest && target.closest(".github-field, .github-check")) {
    setGithubModalError("");
  }
}

function handleGithubModalChange(event) {
  const target = event && event.target;
  if (target && target.id === "github-include-rules") {
    githubModalUi.includeRules = !!target.checked;
  }
}

function trapGithubModalFocus(event) {
  if (!isGithubModalOpen() || !event || event.key !== "Tab") return;
  const layer = els.githubLayer;
  if (!layer || typeof layer.querySelectorAll !== "function") return;
  const nodes = layer.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]");
  if (!nodes || !nodes.length) return;
  const list = Array.prototype.slice.call(nodes);
  const first = list[0];
  const last = list[list.length - 1];
  const active = typeof document !== "undefined" ? document.activeElement : null;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    focusGithubControl(last);
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    focusGithubControl(first);
  }
}
