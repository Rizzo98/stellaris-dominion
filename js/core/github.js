/* ============================================================
   GITHUB — the browser-side GitHub API client
   Two writes come out of the game:

     1. PUSH TO REMOTE commits the current rulebook to
        js/data/standard-rules.js on the repository's main branch. That file is
        loaded by index.html and becomes the default rulebook on the next page
        load (see js/core/run-rules.js).
     2. REPORT opens a public issue on the same repository with the player's
        free text plus the turn, seed, origin and rulebook.

   There is no backend. The username and personal access token typed into the
   window are held in this page's memory only (never a save, never
   localStorage) and are sent only to https://api.github.com. GitHub's REST API
   sends the CORS headers a browser needs, including for PUT and POST, so the
   static app can call it directly.

   The repository target is one constant block below. A fork that wants its own
   standard and issue queue changes owner/repo/branch there.
   ============================================================ */

const GITHUB_TARGET = {
  owner: "Rizzo98",
  repo: "stellaris-dominion",
  branch: "main",
  standardPath: "js/data/standard-rules.js"
};

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_REQUEST_TIMEOUT_MS = 25000;
const GITHUB_ISSUE_BODY_LIMIT = 65000;
const GITHUB_SETTINGS_BLOCK_LIMIT = 45000;
const GITHUB_REPORT_TEXT_LIMIT = 60000;
const GITHUB_APP_LABEL = "Stellar Dominion MVP v3.0";

/* The live session. token is deliberately kept off getGithubSession(), which
   is the shape the UI and the commit metadata are allowed to read. */
let githubSession = null;

function getGithubTarget() {
  return GITHUB_TARGET;
}

function getGithubRepoLabel() {
  return GITHUB_TARGET.owner + "/" + GITHUB_TARGET.repo;
}

function getGithubSession() {
  if (!githubSession) return null;
  return {
    login: githubSession.login,
    name: githubSession.name,
    signedInAt: githubSession.signedInAt
  };
}

function clearGithubSession() {
  githubSession = null;
}

/* ---------- errors ---------- */

function githubError(code, message, status, data) {
  const error = new Error(message);
  error.code = code;
  error.status = typeof status === "number" ? status : 0;
  error.data = data || null;
  return error;
}

function githubResponseError(response, data) {
  const status = response && typeof response.status === "number" ? response.status : 0;
  const apiMessage = data && data.message ? String(data.message) : "";
  let remaining = null;
  if (response && response.headers && typeof response.headers.get === "function") {
    remaining = response.headers.get("x-ratelimit-remaining");
  }
  if (status === 401) {
    return githubError("unauthorized",
      "GitHub rejected that username and token. Use a personal access token (PAT), not your account password.", status, data);
  }
  if ((status === 403 || status === 429) && (remaining === "0" || /rate limit/i.test(apiMessage))) {
    return githubError("rate-limit",
      "The GitHub API rate limit for this token is exhausted. Try again later.", status, data);
  }
  if (status === 429) {
    return githubError("rate-limit",
      "GitHub is rate limiting this token. Try again later.", status, data);
  }
  if (status === 403) {
    return githubError("forbidden",
      "This token is not allowed to do that. It needs Contents: Read and write to push, and Issues: Read and write to report, on " +
      getGithubRepoLabel() + ".", status, data);
  }
  if (status === 404) {
    return githubError("not-found",
      "GitHub could not find " + getGithubRepoLabel() + " (or this token cannot see it). Check the repository and token permissions.",
      status, data);
  }
  if (status === 409) {
    return githubError("conflict",
      "The settings file changed on GitHub while pushing. Try again.", status, data);
  }
  if (status === 422) {
    return githubError("invalid",
      apiMessage || "GitHub rejected the request as invalid.", status, data);
  }
  return githubError("http",
    "GitHub returned HTTP " + status + (apiMessage ? ": " + apiMessage : "."), status, data);
}

/* ---------- text encoding ---------- */

function utf8Bytes(text) {
  const source = String(text == null ? "" : text);
  if (typeof TextEncoder === "function") return new TextEncoder().encode(source);
  const bytes = [];
  for (let index = 0; index < source.length; index += 1) {
    let code = source.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < source.length) {
      const next = source.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        index += 1;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

function base64EncodeUtf8(text) {
  const bytes = utf8Bytes(text);
  if (typeof btoa === "function") {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary);
  }
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  throw githubError("unsupported", "This browser cannot encode the settings file.");
}

/* ---------- request core ---------- */

function githubRepoPath() {
  return encodeURIComponent(GITHUB_TARGET.owner) + "/" + encodeURIComponent(GITHUB_TARGET.repo);
}

function githubEncodePath(path) {
  return String(path == null ? "" : path)
    .split("/")
    .map(function (part) { return encodeURIComponent(part); })
    .join("/");
}

function requireGithubSession() {
  if (!githubSession) {
    throw githubError("auth-required", "Sign in with your GitHub username and a personal access token first.");
  }
  return githubSession;
}

async function githubFetch(path, options) {
  const opts = options || {};
  if (typeof fetch !== "function") {
    throw githubError("unsupported", "This browser cannot reach the GitHub API. Open the game in a current browser.");
  }
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION
  };
  if (opts.token) headers.Authorization = "Bearer " + opts.token;
  const request = {
    method: opts.method || "GET",
    headers: headers,
    cache: "no-store"
  };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    request.body = JSON.stringify(opts.body);
  }

  let timer = null;
  let controller = null;
  if (typeof AbortController === "function") {
    controller = new AbortController();
    request.signal = controller.signal;
    timer = setTimeout(function () { controller.abort(); }, GITHUB_REQUEST_TIMEOUT_MS);
  }

  let response;
  try {
    response = await fetch(GITHUB_API_BASE + path, request);
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw githubError("timeout", "GitHub took too long to answer. Try again.");
    }
    throw githubError("network", "Could not reach api.github.com. Check your connection and try again.");
  } finally {
    if (timer) clearTimeout(timer);
  }

  const text = typeof response.text === "function" ? await response.text() : "";
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = null;
    }
  }
  if (!response.ok) throw githubResponseError(response, data);
  return data;
}

/* ---------- endpoints ---------- */

/* The username is checked against the token owner, then forgotten as a login
   detail: GitHub decides the account from the token. */
async function githubSignIn(username, token) {
  const cleanUsername = String(username == null ? "" : username).trim();
  const cleanToken = String(token == null ? "" : token).trim();
  if (!cleanUsername) throw githubError("validation", "Enter your GitHub username.");
  if (!cleanToken) throw githubError("validation", "Enter a personal access token (PAT).");
  const user = await githubFetch("/user", { token: cleanToken });
  if (!user || !user.login) {
    throw githubError("unauthorized", "GitHub did not return an account for that token.");
  }
  if (String(user.login).toLowerCase() !== cleanUsername.toLowerCase()) {
    throw githubError("account-mismatch",
      "That token belongs to @" + user.login + ", not @" + cleanUsername + ". Check the username and token.");
  }
  githubSession = {
    login: user.login,
    name: typeof user.name === "string" ? user.name : "",
    token: cleanToken,
    signedInAt: new Date().toISOString()
  };
  return getGithubSession();
}

/* Returns the Contents API entry for the standard, or null when it does not
   exist yet (the first push creates it). */
async function githubFetchStandardFile() {
  const session = requireGithubSession();
  try {
    return await githubFetch(
      "/repos/" + githubRepoPath() + "/contents/" + githubEncodePath(GITHUB_TARGET.standardPath) +
        "?ref=" + encodeURIComponent(GITHUB_TARGET.branch),
      { token: session.token }
    );
  } catch (error) {
    if (error && error.status === 404) return null;
    throw error;
  }
}

async function githubPushStandardFile(options) {
  const session = requireGithubSession();
  const opts = options || {};
  const body = {
    message: String(opts.message || "Update the settings standard"),
    content: base64EncodeUtf8(String(opts.content || "")),
    branch: opts.branch || GITHUB_TARGET.branch
  };
  if (opts.sha) body.sha = opts.sha;
  return githubFetch(
    "/repos/" + githubRepoPath() + "/contents/" + githubEncodePath(GITHUB_TARGET.standardPath),
    { method: "PUT", token: session.token, body: body }
  );
}

async function githubCreateIssue(options) {
  const session = requireGithubSession();
  const opts = options || {};
  return githubFetch("/repos/" + githubRepoPath() + "/issues", {
    method: "POST",
    token: session.token,
    body: {
      title: String(opts.title || "In-game report"),
      body: String(opts.body || "")
    }
  });
}

function githubStandardFileUrl() {
  return "https://github.com/" + GITHUB_TARGET.owner + "/" + GITHUB_TARGET.repo +
    "/blob/" + encodeURIComponent(GITHUB_TARGET.branch) + "/" + githubEncodePath(GITHUB_TARGET.standardPath);
}

/* ---------- the published standard file ---------- */

function escapeJsonForSource(json) {
  return String(json)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/* The file is a classic script, like every other data table in the project.
   The rulebook is emitted as a pretty-printed object so a commit diff reads
   like a settings change. A syntax error in this file cannot break the app:
   index.html continues with the next script and run-rules falls back to the
   in-code tables (STANDARD_RULES stays undefined). */
function buildStandardRulesFile(rules, meta) {
  const safeMeta = isRuleObject(meta) ? meta : {};
  const metaJson = escapeJsonForSource(JSON.stringify(safeMeta, null, 2));
  const rulesJson = escapeJsonForSource(JSON.stringify(rules || {}, null, 2));
  const login = String(safeMeta.pushedBy || "unknown").replace(/[^A-Za-z0-9-]/g, "");
  const pushedAt = safeMeta.pushedAt ? String(safeMeta.pushedAt) : "";
  return [
    "/* ============================================================",
    "   STANDARD RULES — the published settings standard",
    "   Generated by the game's debug console (PUSH TO REMOTE). Do not edit",
    "   this file by hand: every debug edit published from the console replaces",
    "   it, including these comments and the metadata below.",
    "",
    "   Published by @" + login + (pushedAt ? " on " + pushedAt : "") + ".",
    "   js/core/run-rules.js applies it over the in-code tables before it",
    "   captures RUN_RULE_DEFAULTS, so RESET, the tweak counter and every new",
    "   match start from these values.",
    "   ============================================================ */",
    "",
    "const STANDARD_RULES_META = " + metaJson + ";",
    "",
    "const STANDARD_RULES = " + rulesJson + ";",
    ""
  ].join("\n");
}

function buildStandardMeta(options) {
  const opts = options || {};
  const session = getGithubSession();
  const meta = {
    schema: 1,
    app: GITHUB_APP_LABEL,
    pushedBy: opts.pushedBy || (session ? session.login : "unknown"),
    pushedAt: opts.pushedAt || new Date().toISOString(),
    tweaks: typeof opts.tweaks === "number" ? opts.tweaks : 0
  };
  if (opts.turn != null) meta.turn = opts.turn;
  if (opts.seed != null) meta.seed = opts.seed;
  if (opts.origin) meta.origin = opts.origin;
  return meta;
}

function buildPushCommitMessage(options) {
  const opts = options || {};
  const tweaks = typeof opts.tweaks === "number" ? opts.tweaks : 0;
  const first = "Publish settings standard · " +
    (tweaks ? tweaks + (tweaks === 1 ? " tweak" : " tweaks") : "no tweaks") +
    (opts.turn != null ? " · turn " + opts.turn : "");
  const lines = [
    first,
    "",
    "Pushed from the Stellar Dominion debug console by @" + (opts.pushedBy || "unknown") + "."
  ];
  if (opts.seed != null) {
    lines.push("Seed " + opts.seed + (opts.origin ? " · " + opts.origin : "") + " · " + GITHUB_APP_LABEL);
  } else {
    lines.push(GITHUB_APP_LABEL);
  }
  return lines.join("\n");
}

/* ---------- report payload ---------- */

function buildIssueTitle(text) {
  const lines = String(text == null ? "" : text).split(/\r?\n/);
  let first = "";
  for (let index = 0; index < lines.length; index += 1) {
    const candidate = lines[index].trim();
    if (candidate) {
      first = candidate;
      break;
    }
  }
  const clean = (first || "In-game report")
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim() || "In-game report";
  const clipped = clean.length > 70 ? clean.slice(0, 69).trim() + "…" : clean;
  return "[REPORT] " + clipped;
}

function issueContextValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replace(/\s+/g, " ").slice(0, 300);
}

function buildIssueBody(options) {
  const opts = options || {};
  const text = String(opts.text == null ? "" : opts.text).trim();
  const context = opts.context || {};
  const lines = [
    "### In-game report",
    "",
    text || "_No description provided._",
    "",
    "---",
    "**Game context**",
    "",
    "- Turn: " + issueContextValue(context.turn),
    "- Galaxy seed: " + issueContextValue(context.seed),
    "- Origin: " + issueContextValue(context.origin),
    "- Colonies: " + issueContextValue(context.colonies),
    "- Stability: " + issueContextValue(context.stability),
    "- Current sector: " + issueContextValue(context.sector),
    "- Rule tweaks: " + issueContextValue(context.tweaks),
    "- Settings standard: " + issueContextValue(context.standard),
    "- Build: " + GITHUB_APP_LABEL,
    "- Browser: " + issueContextValue(context.userAgent),
    "- Reported by: @" + issueContextValue(context.login),
    "- Reported at: " + issueContextValue(context.reportedAt || new Date().toISOString())
  ];
  if (opts.includeRules !== false && opts.rules) {
    const settings = JSON.stringify(opts.rules);
    if (settings.length <= GITHUB_SETTINGS_BLOCK_LIMIT) {
      lines.push("", "<details>", "<summary>Current rulebook</summary>", "", "```json", settings, "```", "", "</details>");
    } else {
      lines.push("", "_The current rulebook was too large to attach (" + settings.length + " characters)._");
    }
  }
  let body = lines.join("\n");
  if (body.length > GITHUB_ISSUE_BODY_LIMIT) {
    if (opts.includeRules !== false && opts.rules) {
      const withoutRules = buildIssueBody(Object.assign({}, opts, { includeRules: false }));
      if (withoutRules.length <= GITHUB_ISSUE_BODY_LIMIT) return withoutRules;
    }
    throw githubError("too-long",
      "This report is too long for a GitHub issue. Shorten it and try again.");
  }
  return body;
}
