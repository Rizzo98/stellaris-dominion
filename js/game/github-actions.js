/* ============================================================
   GITHUB ACTIONS — the two writes behind the GitHub window
   The API client and payload builders live in js/core/github.js; the window
   lives in js/ui/github-modal.js. This file owns the submit flow: validate,
   sign in once per tab, write, then hand the result back to the window.

   Pushing adopts the rulebook as this page's standard immediately. The
   committed js/data/standard-rules.js is what the next page load reads.
   ============================================================ */

let githubSubmitBusy = false;

function githubUserAgent() {
  if (typeof navigator !== "undefined" && navigator.userAgent) return navigator.userAgent;
  return "unknown";
}

/* State read by both windows. live is false on the setup page; the report
   window is only reachable in a live run, but the push window is not. */
function collectGithubFacts() {
  const live = !!state && (state.phase === "actions" || state.phase === "event" || state.phase === "transition");
  const ethic = typeof getEthic === "function" && state && state.ethic ? getEthic() : null;
  const sector = live && typeof getCurrentSector === "function" ? getCurrentSector() : null;
  return {
    live: live,
    turn: live && state ? state.turn : null,
    seed: state && state.galaxy ? state.galaxy.seed : CONFIG.galaxy.seed,
    origin: ethic && ethic.name ? ethic.name : null,
    colonies: live && state && Array.isArray(state.systems)
      ? state.systems.filter(function (system) { return system && system.colonized; }).length
      : 0,
    stability: live && state && typeof state.stability === "number" ? Math.round(state.stability) : null,
    sector: sector ? getSectorLabel(sector) : null,
    tweaks: countRuleOverrides(),
    userAgent: githubUserAgent(),
    reportedAt: new Date().toISOString()
  };
}

function githubStandardDescription() {
  const meta = typeof getRunStandardMeta === "function" ? getRunStandardMeta() : null;
  if (meta && meta.pushedBy) {
    return "@" + meta.pushedBy + (meta.pushedAt ? " · " + String(meta.pushedAt).slice(0, 10) : "");
  }
  if (typeof isRunStandardActive === "function" && isRunStandardActive()) return "published (no metadata)";
  return "in-code defaults";
}

function githubUiError(error) {
  if (!error) return "The request failed. Try again.";
  if (error.message) return error.message;
  return String(error);
}

function captureGithubReportDraft() {
  const textarea = byId("github-report-text");
  if (textarea) {
    githubModalUi.reportText = textarea.value;
    githubReportDraft = textarea.value;
  }
  const include = byId("github-include-rules");
  if (include) githubModalUi.includeRules = !!include.checked;
}

/* One sign-in per tab. The fields stay in place when the request fails, so a
   typo in the token does not wipe the report text. On success the fields are
   replaced by the signed-in card and the draft survives the repaint. */
async function ensureGithubAuthFromForm() {
  if (getGithubSession()) return true;
  captureGithubReportDraft();
  const usernameInput = byId("github-username");
  const tokenInput = byId("github-token");
  const username = usernameInput ? String(usernameInput.value || "").trim() : "";
  const token = tokenInput ? String(tokenInput.value || "").trim() : "";
  if (!username) {
    setGithubModalError("Enter your GitHub username.");
    focusGithubControl(usernameInput);
    return false;
  }
  if (!token) {
    setGithubModalError("Enter a personal access token (PAT).");
    focusGithubControl(tokenInput);
    return false;
  }
  setGithubModalPending(true, "SIGNING IN…");
  try {
    await githubSignIn(username, token);
    githubModalUi.error = "";
    renderGithubModal();
    return true;
  } catch (error) {
    setGithubModalPending(false);
    setGithubModalError(githubUiError(error));
    return false;
  }
}

async function submitGithubPush() {
  if (githubSubmitBusy) return false;
  githubSubmitBusy = true;
  try {
    const facts = collectGithubFacts();
    if (!getGithubSession()) {
      const authenticated = await ensureGithubAuthFromForm();
      if (!authenticated) return false;
    }
    setGithubModalPending(true, "PUSHING…");
    setGithubModalError("");

    const session = getGithubSession();
    const rules = captureRunRules();
    const meta = buildStandardMeta({
      pushedBy: session.login,
      turn: facts.turn,
      seed: facts.seed,
      origin: facts.origin,
      tweaks: facts.tweaks
    });
    const content = buildStandardRulesFile(rules, meta);
    const existing = await githubFetchStandardFile();
    const result = await githubPushStandardFile({
      content: content,
      sha: existing && existing.sha ? existing.sha : null,
      message: buildPushCommitMessage({
        tweaks: facts.tweaks,
        turn: facts.turn,
        pushedBy: session.login,
        seed: facts.seed,
        origin: facts.origin
      })
    });

    const commit = result && result.commit ? result.commit : {};
    const publishedMeta = Object.assign({}, meta, {
      commitSha: commit.sha || null,
      commitUrl: commit.html_url || null
    });
    adoptRunStandard(rules, publishedMeta);
    if (typeof renderDebugContext === "function" && els.debugScreen &&
        !els.debugScreen.classList.contains("hidden")) {
      renderDebugContext();
    }
    githubModalUi.pending = false;
    githubModalUi.error = "";
    githubModalUi.success = {
      kind: "push",
      commitSha: commit.sha || null,
      commitUrl: commit.html_url || null
    };
    renderGithubModal();
    return true;
  } catch (error) {
    setGithubModalPending(false);
    setGithubModalError(githubUiError(error));
    return false;
  } finally {
    githubSubmitBusy = false;
  }
}

async function submitGithubReport() {
  if (githubSubmitBusy) return false;
  githubSubmitBusy = true;
  try {
    const textarea = byId("github-report-text");
    const text = textarea
      ? String(textarea.value || "").trim()
      : String(githubModalUi.reportText || "").trim();
    captureGithubReportDraft();
    if (!text) {
      setGithubModalError("Write what happened before filing the report.");
      focusGithubControl(textarea);
      return false;
    }

    if (!getGithubSession()) {
      const authenticated = await ensureGithubAuthFromForm();
      if (!authenticated) return false;
    }
    setGithubModalPending(true, "FILING…");
    setGithubModalError("");

    const facts = collectGithubFacts();
    const session = getGithubSession();
    const includeRules = githubModalUi.includeRules !== false;
    const body = buildIssueBody({
      text: text,
      context: Object.assign({}, facts, {
        login: session.login,
        standard: githubStandardDescription()
      }),
      rules: includeRules ? captureRunRules() : null,
      includeRules: includeRules
    });
    const issue = await githubCreateIssue({
      title: buildIssueTitle(text),
      body: body
    });

    githubReportDraft = "";
    githubModalUi.pending = false;
    githubModalUi.error = "";
    githubModalUi.success = {
      kind: "report",
      number: issue && issue.number ? issue.number : null,
      title: issue && issue.title ? issue.title : buildIssueTitle(text),
      url: issue && issue.html_url ? issue.html_url : null
    };
    renderGithubModal();
    return true;
  } catch (error) {
    setGithubModalPending(false);
    setGithubModalError(githubUiError(error));
    return false;
  } finally {
    githubSubmitBusy = false;
  }
}

function handleGithubModalSubmit(event) {
  if (event && typeof event.preventDefault === "function") event.preventDefault();
  if (!isGithubModalOpen() || githubModalUi.pending || githubSubmitBusy) return;
  if (githubModalMode === "report") {
    submitGithubReport();
  } else {
    submitGithubPush();
  }
}
