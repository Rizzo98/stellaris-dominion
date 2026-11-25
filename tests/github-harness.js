#!/usr/bin/env node
/* ============================================================
   GITHUB HARNESS — standard file, API client, window markup and both flows
   The app has no build step, so this harness loads the classic browser
   scripts in a Node VM with element stubs. GitHub itself is replaced by a
   small fetch mock. Run it with:

       node tests/github-harness.js
   ============================================================ */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const dataFiles = [
  "js/data/config.js",
  "js/data/ethics.js",
  "js/data/buildings.js",
  "js/data/structures.js",
  "js/data/ships.js",
  "js/data/empires.js",
  "js/data/techs.js",
  "js/data/events.js",
  "js/data/anomalies.js",
  "js/data/resources.js",
  "js/data/systems.js",
  "js/data/debug-schema.js"
];
const appFiles = dataFiles.concat([
  "js/data/standard-rules.js",
  "js/core/rng.js",
  "js/core/galaxy.js",
  "js/core/state.js",
  "js/core/run-rules.js",
  "js/core/helpers.js",
  "js/core/colony.js",
  "js/core/colony-economy.js",
  "js/core/hex-grid.js",
  "js/core/empires.js",
  "js/core/combat.js",
  "js/core/rival-ai.js",
  "js/core/effects.js",
  "js/core/survey.js",
  "js/core/event-engine.js",
  "js/core/trade.js",
  "js/core/economy.js",
  "js/core/save.js",
  "js/core/github.js",
  "js/ui/dom.js",
  "js/ui/debug-screen.js",
  "js/ui/github-modal.js",
  "js/ui/topbar.js",
  "js/game/github-actions.js"
]);

let checks = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}
function eq(actual, expected, message) {
  assert.strictEqual(actual, expected, message + " (got " + actual + ", want " + expected + ")");
  checks += 1;
}
function includes(haystack, needle, message) {
  assert.ok(String(haystack).indexOf(needle) !== -1,
    message + " (missing " + JSON.stringify(needle) + ")");
  checks += 1;
}
function excludes(haystack, needle, message) {
  assert.ok(String(haystack).indexOf(needle) === -1,
    message + " (unexpected " + JSON.stringify(needle) + ")");
  checks += 1;
}

/* ---------- a fetch mock and a fake DOM ---------- */

const mock = {
  calls: [],
  userLogin: "rizzo-test",
  failAuth: false,
  failNetwork: false,
  rateLimited: false,
  contentsForbidden: false,
  failIssue: false,
  fileExists: false,
  fileSha: "blob-old",
  lastCommitSha: "commit-abc123"
};

function resetMock() {
  mock.calls.length = 0;
  mock.userLogin = "rizzo-test";
  mock.failAuth = false;
  mock.failNetwork = false;
  mock.rateLimited = false;
  mock.contentsForbidden = false;
  mock.failIssue = false;
  mock.fileExists = false;
  mock.fileSha = "blob-old";
  mock.lastCommitSha = "commit-abc123";
}

function mockResponse(status, data, extraHeaders) {
  const headers = Object.assign({ "x-ratelimit-remaining": "4999" }, extraHeaders || {});
  return {
    ok: status >= 200 && status < 300,
    status: status,
    headers: {
      get: function (name) {
        const key = String(name).toLowerCase();
        return Object.prototype.hasOwnProperty.call(headers, key) ? headers[key] : null;
      }
    },
    text: function () {
      return Promise.resolve(data === undefined ? "" : JSON.stringify(data));
    }
  };
}

async function mockFetch(url, options) {
  const address = String(url);
  const method = (options && options.method) || "GET";
  const call = {
    url: address,
    method: method,
    headers: Object.assign({}, options && options.headers),
    body: options && options.body ? String(options.body) : null
  };
  mock.calls.push(call);
  if (mock.failNetwork) throw new TypeError("Failed to fetch");

  if (address.endsWith("/user")) {
    if (mock.rateLimited) {
      return mockResponse(403, { message: "API rate limit exceeded" }, { "x-ratelimit-remaining": "0" });
    }
    if (mock.failAuth) return mockResponse(401, { message: "Bad credentials" });
    return mockResponse(200, { login: mock.userLogin, name: "Test Rizzo" });
  }
  if (address.indexOf("/contents/js/data/standard-rules.js") !== -1) {
    if (mock.contentsForbidden && method === "GET") {
      return mockResponse(403, { message: "Resource not accessible by personal access token" });
    }
    if (method === "GET") {
      if (!mock.fileExists) return mockResponse(404, { message: "Not Found" });
      return mockResponse(200, { sha: mock.fileSha, path: "js/data/standard-rules.js" });
    }
    if (method === "PUT") {
      mock.fileExists = true;
      return mockResponse(200, {
        content: {
          sha: "blob-new",
          html_url: "https://github.com/Rizzo98/stellaris-dominion/blob/main/js/data/standard-rules.js"
        },
        commit: {
          sha: mock.lastCommitSha,
          html_url: "https://github.com/Rizzo98/stellaris-dominion/commit/" + mock.lastCommitSha
        }
      });
    }
  }
  if (address.endsWith("/issues") && method === "POST") {
    if (mock.failIssue) return mockResponse(422, { message: "Validation Failed" });
    const payload = call.body ? JSON.parse(call.body) : {};
    return mockResponse(201, {
      number: 42,
      title: payload.title,
      html_url: "https://github.com/Rizzo98/stellaris-dominion/issues/42"
    });
  }
  return mockResponse(500, { message: "Unexpected mock request: " + method + " " + address });
}

function fakeElement() {
  return {
    innerHTML: "",
    textContent: "",
    value: "",
    checked: false,
    disabled: false,
    style: {},
    attributes: {},
    dataset: {},
    scrollTop: 0,
    classList: {
      set: new Set(),
      add: function () { for (let i = 0; i < arguments.length; i += 1) this.set.add(arguments[i]); },
      remove: function () { for (let i = 0; i < arguments.length; i += 1) this.set.delete(arguments[i]); },
      toggle: function (name, force) {
        const next = force === undefined ? !this.set.has(name) : !!force;
        if (next) this.set.add(name);
        else this.set.delete(name);
        return next;
      },
      contains: function (name) { return this.set.has(name); }
    },
    setAttribute: function (key, value) { this.attributes[key] = String(value); },
    getAttribute: function (key) {
      return Object.prototype.hasOwnProperty.call(this.attributes, key) ? this.attributes[key] : null;
    },
    removeAttribute: function (key) { delete this.attributes[key]; },
    addEventListener: function () {},
    focus: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
}

function createAppContext() {
  const elements = {};
  const context = {
    console: console,
    Math: Math,
    Date: Date,
    JSON: JSON,
    Set: Set,
    Map: Map,
    Object: Object,
    Array: Array,
    Number: Number,
    String: String,
    Boolean: Boolean,
    isFinite: isFinite,
    parseInt: parseInt,
    parseFloat: parseFloat,
    encodeURIComponent: encodeURIComponent,
    TextEncoder: TextEncoder,
    Uint8Array: Uint8Array,
    btoa: function (binary) { return Buffer.from(binary, "binary").toString("base64"); },
    performance: { now: function () { return 0; } },
    requestAnimationFrame: function () { return 0; },
    setTimeout: function () { return 1; },
    clearTimeout: function () {},
    fetch: mockFetch,
    navigator: { userAgent: "StellarisGithubHarness/1.0" },
    document: {
      activeElement: null,
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      getElementById: function (id) {
        if (!elements[id]) elements[id] = fakeElement();
        return elements[id];
      },
      addEventListener: function () {}
    },
    window: {}
  };
  vm.createContext(context);
  appFiles.forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  });
  vm.runInContext([
    "var toastMessages = [];",
    "toast = function (message) { toastMessages.push(message); };",
    "renderAll = function () {};",
    "renderSeedInput = function () {};",
    "state = createInitialState(null);",
    'state.phase = "start";'
  ].join("\n"), context, { filename: "github-harness-bootstrap.js" });
  return context;
}

function createDataContext() {
  const context = {
    console: console,
    Math: Math,
    Date: Date,
    JSON: JSON,
    Set: Set,
    Map: Map,
    Object: Object,
    Array: Array,
    Number: Number,
    String: String,
    Boolean: Boolean,
    isFinite: isFinite,
    parseInt: parseInt,
    parseFloat: parseFloat
  };
  vm.createContext(context);
  dataFiles.forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  });
  return context;
}

const context = createAppContext();
function run(code) {
  return vm.runInContext(code, context);
}

/* ---------- 1. the shipped standard is empty ---------- */
eq(run("getRunStandardMeta()"), null, "the shipped standard has no metadata");
eq(run("isRunStandardActive()"), false, "the shipped standard is inactive");
eq(run("countRuleOverrides()"), 0, "the in-code tables are the default with no published standard");

/* ---------- 2. base64 and the generated standard file ---------- */
const encoded = run('base64EncodeUtf8("città ✓ 日本")');
eq(Buffer.from(encoded, "base64").toString("utf8"), "città ✓ 日本", "UTF-8 base64 round-trips");

run("CONFIG.startingResources.energy = 33; CONFIG.baseIncome.energy = 9;");
const generated = run('buildStandardRulesFile(captureRunRules(), { pushedBy: "rizzo-test", pushedAt: "2026-11-25T10:00:00.000Z", turn: 7, seed: 20261112, tweaks: 2 })');
includes(generated, "const STANDARD_RULES_META", "the generated file declares its metadata");
includes(generated, "const STANDARD_RULES =", "the generated file declares the rulebook");
includes(generated, "Published by @rizzo-test", "the generated header names the pusher");
const parsed = new Function(generated + "; return { meta: STANDARD_RULES_META, rules: STANDARD_RULES };")();
eq(parsed.meta.pushedBy, "rizzo-test", "the generated metadata survives parsing");
eq(parsed.rules.config.startingResources.energy, 33, "the generated rulebook holds the edited value");
eq(parsed.rules.config.baseIncome.energy, 9, "the generated rulebook holds every edit");

/* ---------- 3. boot adoption in a fresh realm ---------- */
const boot = createDataContext();
vm.runInContext(generated, boot, { filename: "generated-standard.js" });
vm.runInContext(fs.readFileSync(path.join(root, "js/core/run-rules.js"), "utf8"), boot, { filename: "js/core/run-rules.js" });
eq(vm.runInContext("CONFIG.startingResources.energy", boot), 33, "a published standard becomes the boot CONFIG");
eq(vm.runInContext("RUN_RULE_DEFAULTS.config.startingResources.energy", boot), 33, "a published standard becomes the default rulebook");
eq(vm.runInContext("getRunStandardMeta().pushedBy", boot), "rizzo-test", "a published standard keeps its metadata");
eq(vm.runInContext("isRunStandardActive()", boot), true, "a published standard is marked active");
eq(vm.runInContext("countRuleOverrides()", boot), 0, "a freshly loaded standard reports no tweaks");
vm.runInContext("CONFIG.startingResources.energy = 1; resetRunRules();", boot);
eq(vm.runInContext("CONFIG.startingResources.energy", boot), 33, "RESET returns to the published standard");

const codeOnly = createDataContext();
vm.runInContext(fs.readFileSync(path.join(root, "js/core/run-rules.js"), "utf8"), codeOnly, { filename: "js/core/run-rules.js" });
eq(vm.runInContext("CONFIG.startingResources.energy", codeOnly), 15, "no standard leaves the in-code tables in charge");
eq(vm.runInContext("getRunStandardMeta()", codeOnly), null, "no standard has no metadata");

const partial = createDataContext();
vm.runInContext('const STANDARD_RULES_META = { pushedBy: "partial" }; const STANDARD_RULES = { config: { startingResources: { energy: 42 }, economy: { facilities: { levels: [] } } } };', partial, { filename: "partial-standard.js" });
vm.runInContext(fs.readFileSync(path.join(root, "js/core/run-rules.js"), "utf8"), partial, { filename: "js/core/run-rules.js" });
eq(vm.runInContext("CONFIG.startingResources.energy", partial), 42, "a partial standard overrides the field it names");
eq(vm.runInContext("CONFIG.baseIncome.energy", partial), 4, "a partial standard keeps every other code default");
eq(vm.runInContext("CONFIG.economy.facilities.levels.length", partial), 4, "an empty critical list falls back to the code default");

run("resetRunRules();");

/* ---------- 4. adopt a push result without a reload ---------- */
run("var codeDefaults = JSON.stringify(RUN_RULE_DEFAULTS);");
run("CONFIG.startingResources.energy = 77; var pushedRules = captureRunRules();");
run('adoptRunStandard(pushedRules, { pushedBy: "rizzo-test", pushedAt: "2026-11-25T10:00:00.000Z", commitSha: "abc" });');
eq(run("getRunStandardMeta().pushedBy"), "rizzo-test", "adopt keeps the commit metadata");
eq(run("isRunStandardActive()"), true, "adopt marks the standard active");
eq(run("countRuleOverrides()"), 0, "adopt makes the pushed rulebook the baseline");
run("CONFIG.startingResources.energy = 99; resetRunRules();");
eq(run("CONFIG.startingResources.energy"), 77, "RESET after adopt restores the pushed value");
run("adoptRunStandard(JSON.parse(codeDefaults), null); RUN_STANDARD_ACTIVE = false; RUN_STANDARD_META = null; resetRunRules();");
eq(run("countRuleOverrides()"), 0, "the harness can restore the code defaults");

/* ---------- 5. report payload builders ---------- */
eq(run('buildIssueTitle("  ## A planet vanished" + String.fromCharCode(10) + "More detail")'), "[REPORT] A planet vanished", "the issue title takes the first line and strips hashes");
ok(run('buildIssueTitle("x".repeat(200))').length <= 79, "a long issue title is clipped");
ok(run('buildIssueTitle("x".repeat(200))').slice(-1) === "…", "a clipped issue title ends with an ellipsis");
const issueBody = run([
  "buildIssueBody({",
  '  text: "The colony screen froze.",',
  '  context: { turn: 7, seed: 20261112, origin: "Xenophile", colonies: 2, stability: 64, sector: "Solara Core", tweaks: 3, standard: "@rizzo-test", userAgent: "Test/1", login: "rizzo-test", reportedAt: "2026-11-25T10:00:00.000Z" },',
  '  rules: { config: { startingResources: { energy: 33 } } },',
  "  includeRules: true",
  "})"
].join("\n"));
includes(issueBody, "The colony screen froze.", "the report body carries the free text");
includes(issueBody, "Turn: 7", "the report body carries the turn");
includes(issueBody, "Galaxy seed: 20261112", "the report body carries the seed");
includes(issueBody, "Reported by: @rizzo-test", "the report body names the reporter");
includes(issueBody, "<summary>Current rulebook</summary>", "the report body attaches the rulebook");
const issueNoRules = run('buildIssueBody({ text: "No settings", context: { turn: 1 }, rules: { big: 1 }, includeRules: false })');
excludes(issueNoRules, "<details>", "the report can omit the rulebook");
const hugeRules = run('buildIssueBody({ text: "Huge", context: { turn: 1 }, rules: { blob: "x".repeat(50000) }, includeRules: true })');
includes(hugeRules, "too large to attach", "an oversized rulebook is omitted with a note");
let tooLong = null;
try {
  run('buildIssueBody({ text: "x".repeat(67000), context: { turn: 1 }, includeRules: false })');
} catch (error) {
  tooLong = error;
}
ok(tooLong && tooLong.code === "too-long", "a report longer than a GitHub issue is rejected");

/* ---------- 6. API endpoints against the mock ---------- */
(async function apiChecks() {
  run("clearGithubSession();");
  eq(run("getGithubSession()"), null, "no session before sign-in");

  resetMock();
  const session = await run('githubSignIn("rizzo-test", "tok_123")');
  eq(session.login, "rizzo-test", "sign-in returns the token owner");
  eq(run("JSON.stringify(getGithubSession()).indexOf('tok_123')"), -1, "the public session never exposes the token");
  const userCall = mock.calls[0];
  eq(userCall.method, "GET", "sign-in uses GET /user");
  eq(userCall.headers.Authorization, "Bearer tok_123", "the token travels as a bearer token");

  resetMock();
  mock.fileExists = false;
  eq(await run("githubFetchStandardFile()"), null, "a missing standard reads as null");
  eq(mock.calls[0].url, "https://api.github.com/repos/Rizzo98/stellaris-dominion/contents/js/data/standard-rules.js?ref=main",
    "the standard path and branch are encoded in the Contents URL");

  resetMock();
  mock.fileExists = true;
  mock.fileSha = "sha-1";
  const existing = await run("githubFetchStandardFile()");
  eq(existing.sha, "sha-1", "an existing standard returns its blob sha");
  const putResult = await run('githubPushStandardFile({ content: "hello", sha: "sha-1", message: "Publish" })');
  eq(putResult.commit.sha, "commit-abc123", "the push returns the commit");
  const putCall = mock.calls[1];
  eq(putCall.method, "PUT", "the push uses PUT on the Contents API");
  const putBody = JSON.parse(putCall.body);
  eq(putBody.branch, "main", "the push targets main");
  eq(putBody.sha, "sha-1", "an existing file sends its sha");
  eq(putBody.message, "Publish", "the commit message is sent");
  eq(Buffer.from(putBody.content, "base64").toString("utf8"), "hello", "the file content is base64 encoded");

  resetMock();
  mock.fileExists = false;
  const createResult = await run('githubPushStandardFile({ content: "new file", message: "Create" })');
  eq(createResult.commit.sha, "commit-abc123", "a missing file is created");
  ok(!("sha" in JSON.parse(mock.calls[0].body)), "a new file sends no sha");

  resetMock();
  const issue = await run('githubCreateIssue({ title: "[REPORT] Test", body: "Details" })');
  eq(issue.number, 42, "an issue response returns its number");
  eq(mock.calls[0].method, "POST", "the report uses POST /issues");
  const issueBodyPayload = JSON.parse(mock.calls[0].body);
  eq(issueBodyPayload.title, "[REPORT] Test", "the issue title is sent");
  eq(issueBodyPayload.body, "Details", "the issue body is sent");

  resetMock();
  mock.failAuth = true;
  let authError = null;
  try { await run('githubSignIn("rizzo-test", "bad")'); } catch (error) { authError = error; }
  ok(authError && authError.code === "unauthorized", "a rejected token maps to an unauthorized error");
  includes(authError.message, "personal access token", "the rejected token message names the PAT");

  resetMock();
  mock.rateLimited = true;
  let rateError = null;
  try { await run('githubSignIn("rizzo-test", "tok")'); } catch (error) { rateError = error; }
  ok(rateError && rateError.code === "rate-limit", "a zero rate limit maps to a rate-limit error");

  resetMock();
  mock.contentsForbidden = true;
  let forbiddenError = null;
  try { await run("githubFetchStandardFile()"); } catch (error) { forbiddenError = error; }
  ok(forbiddenError && forbiddenError.code === "forbidden", "a read-only token maps to a permission error");
  includes(forbiddenError.message, "Contents: Read and write", "the permission error names the needed scope");

  resetMock();
  mock.failNetwork = true;
  let networkError = null;
  try { await run('githubSignIn("rizzo-test", "tok")'); } catch (error) { networkError = error; }
  ok(networkError && networkError.code === "network", "an offline fetch maps to a network error");

  resetMock();
  run("clearGithubSession();");
  let mismatchError = null;
  try { await run('githubSignIn("someone-else", "tok")'); } catch (error) { mismatchError = error; }
  ok(mismatchError && mismatchError.code === "account-mismatch", "a token from another account is rejected");
  includes(mismatchError.message, "@rizzo-test", "the mismatch message names the token owner");
  eq(run("getGithubSession()"), null, "a mismatched sign-in leaves no session");

  /* ---------- 7. window markup ---------- */
  resetMock();
  run('clearGithubSession(); state = createInitialState("xenophile"); state.phase = "actions"; state.turn = 7; CONFIG.startingResources.energy = 33;');
  eq(run("openGithubPushModal()"), true, "the push window opens");
  eq(run("isGithubModalOpen()"), true, "the push window is visible");
  includes(run("els.githubBody.innerHTML"), "Rizzo98/stellaris-dominion", "the push window names the repository");
  includes(run("els.githubBody.innerHTML"), "js/data/standard-rules.js", "the push window names the file");
  includes(run("els.githubFoot.innerHTML"), "SIGN IN &amp; PUSH", "the signed-out footer asks to sign in and push");
  includes(run("els.githubBody.innerHTML"), "Contents: Read and write", "the push window documents the token scope");
  includes(run("els.githubBody.innerHTML"), "IN-CODE DEFAULTS", "the push window names the current standard");
  ok(run("els.githubBody.innerHTML.indexOf('github-username') !== -1"), "the push window asks for a username");
  ok(run("els.githubBody.innerHTML.indexOf('password') !== -1"), "the push window masks the token");

  run('closeGithubModal(); state.phase = "actions";');
  eq(run("openGithubReportModal()"), true, "the report window opens in a playable turn");
  includes(run("els.githubBody.innerHTML"), "WHAT HAPPENED", "the report window has a free-text field");
  includes(run("els.githubBody.innerHTML"), 'maxlength="60000"', "the report text is capped");
  includes(run("els.githubBody.innerHTML"), "github-include-rules", "the report window offers the rulebook attachment");
  includes(run("els.githubBody.innerHTML"), "TURN", "the report window previews the run context");
  includes(run("els.githubFoot.innerHTML"), "SIGN IN &amp; FILE ISSUE", "the signed-out footer asks to sign in and file");

  run('githubModalUi.reportText = "<img src=x onerror=alert(1)>"; renderGithubModal();');
  includes(run("els.githubBody.innerHTML"), "&lt;img src=x onerror=alert(1)&gt;", "the report text is escaped in the window");
  run('githubModalUi.reportText = "Planet vanished"; renderGithubModal();');
  includes(run("els.githubBody.innerHTML"), "[REPORT] Planet vanished", "the report window previews the issue title");

  run("handleGithubModalInput({ target: { id: 'github-report-text', value: 'New text', closest: function () { return null; } } });");
  eq(run("githubModalUi.reportText"), "New text", "typing updates the report draft");
  eq(run("githubReportDraft"), "New text", "the draft survives a close");
  run("closeGithubModal();");
  eq(run("isGithubModalOpen()"), false, "the window closes");

  /* ---------- 8. end-to-end push and report ---------- */
  resetMock();
  run([
    "clearGithubSession();",
    'state = createInitialState("xenophile");',
    'state.phase = "actions";',
    "state.turn = 7;",
    "CONFIG.startingResources.energy = 33;",
    "openGithubPushModal();",
    'byId("github-username").value = "rizzo-test";',
    'byId("github-token").value = "tok_123";'
  ].join("\n"));
  const pushOkay = await run("submitGithubPush()");
  eq(pushOkay, true, "the push action succeeds against the mock");
  eq(run("githubModalUi.success.kind"), "push", "the window shows a push success");
  eq(run("githubModalUi.success.commitSha"), "commit-abc123", "the success carries the commit sha");
  eq(run("getRunStandardMeta().pushedBy"), "rizzo-test", "the push adopts the standard metadata");
  eq(run("getRunStandardMeta().commitSha"), "commit-abc123", "the adopted standard carries the commit sha");
  eq(run("countRuleOverrides()"), 0, "the pushed rules become the tweak baseline");
  includes(run("els.githubBody.innerHTML"), "STANDARD PUBLISHED", "the window renders the push success");
  includes(run("els.githubBody.innerHTML"), "VIEW COMMIT", "the push success links the commit");
  const pushCalls = mock.calls.map(function (call) { return call.method + " " + call.url.replace("https://api.github.com", ""); });
  ok(pushCalls.indexOf("GET /user") !== -1, "the push signs in first");
  ok(pushCalls.some(function (entry) { return entry.indexOf("GET /repos/Rizzo98/stellaris-dominion/contents/js/data/standard-rules.js") === 0; }),
    "the push reads the existing standard first");
  const putIndex = mock.calls.findIndex(function (call) { return call.method === "PUT"; });
  ok(putIndex !== -1, "the push sends the file");
  const pushedFile = Buffer.from(JSON.parse(mock.calls[putIndex].body).content, "base64").toString("utf8");
  includes(pushedFile, "const STANDARD_RULES =", "the committed file is a standard file");
  includes(pushedFile, '"energy": 33', "the committed file holds the live settings");
  includes(JSON.parse(mock.calls[putIndex].body).message, "Publish settings standard", "the commit message describes the push");
  eq(run("toastMessages.length"), 0, "the push success view is the feedback; no duplicate toast");

  run("closeGithubModal();");
  eq(run("isGithubModalOpen()"), false, "the success window closes");
  eq(run("getGithubSession().login"), "rizzo-test", "the session survives the close for the next action");

  run([
    'githubReportDraft = "";',
    'byId("github-report-text").value = "The colony screen froze after I opened the population menu.";',
    "openGithubReportModal();"
  ].join("\n"));
  includes(run("els.githubBody.innerHTML"), "@rizzo-test", "the report window reuses the signed-in session");
  excludes(run("els.githubBody.innerHTML"), 'id="github-username"', "the signed-in report window hides the credentials");
  run([
    'byId("github-report-text").value = "The colony screen froze after I opened the population menu.";',
    'byId("github-include-rules").checked = true;'
  ].join("\n"));
  const reportOkay = await run("submitGithubReport()");
  eq(reportOkay, true, "the report action succeeds against the mock");
  eq(run("githubModalUi.success.kind"), "report", "the window shows a report success");
  eq(run("githubModalUi.success.number"), 42, "the success carries the issue number");
  eq(run("githubReportDraft"), "", "a filed report clears the draft");
  includes(run("els.githubBody.innerHTML"), "ISSUE #42 FILED", "the window renders the issue number");
  includes(run("els.githubBody.innerHTML"), "OPEN THE ISSUE", "the report success links the issue");
  const issueCall = mock.calls[mock.calls.length - 1];
  eq(issueCall.method, "POST", "the report posts the issue");
  const reportPayload = JSON.parse(issueCall.body);
  includes(reportPayload.title, "The colony screen froze", "the issue title comes from the free text");
  includes(reportPayload.body, "The colony screen froze after I opened the population menu.", "the issue body carries the free text");
  includes(reportPayload.body, "Turn: 7", "the issue body carries the turn");
  includes(reportPayload.body, "Current rulebook", "the issue body attaches the rules by default");

  run("closeGithubModal();");

  /* ---------- 9. sign-out and the debug footer ---------- */
  resetMock();
  run('githubSignIn("rizzo-test", "tok_123");');
  eq(run("getGithubSession().login"), "rizzo-test", "the harness signs in again");
  run('handleGithubModalClick({ target: { closest: function (selector) { return selector === "[data-github-signout]" ? this : null; } } });');
  eq(run("getGithubSession()"), null, "SIGN OUT clears the session");

  run("adoptRunStandard(JSON.parse(codeDefaults), null); RUN_STANDARD_ACTIVE = false; RUN_STANDARD_META = null; resetRunRules(); clearGithubSession(); renderDebugContext();");
  includes(run("els.debugStandard.textContent"), "IN-CODE DEFAULTS", "the debug footer names the in-code standard");
  run("CONFIG.startingResources.energy = 20; renderDebugContext();");
  includes(run("els.debugStandard.textContent"), "1 TWEAK UNPUBLISHED", "the debug footer counts unpublished tweaks");
  run("resetRunRules(); adoptRunStandard(captureRunRules(), { pushedBy: 'rizzo-test', pushedAt: '2026-11-25T10:00:00.000Z' }); renderDebugContext();");
  includes(run("els.debugStandard.textContent"), "@rizzo-test", "the debug footer names the publisher");
  includes(run("els.debugStandard.textContent"), "2026-11-25", "the debug footer names the publish date");
  includes(run("els.debugStandard.textContent"), "UP TO DATE", "the debug footer reports an up-to-date standard");

  /* restore the harness baseline */
  run("adoptRunStandard(JSON.parse(codeDefaults), null); RUN_STANDARD_ACTIVE = false; RUN_STANDARD_META = null; resetRunRules(); clearGithubSession();");

  run('state.phase = "start"; renderSaveChip();');
  ok(run('els.reportChip.classList.contains("hidden")'), "the report chip is hidden outside a playable turn");
  run('state.phase = "actions"; renderSaveChip();');
  ok(!run('els.reportChip.classList.contains("hidden")'), "the report chip is shown on a playable turn");
  ok(!run('els.saveChip.classList.contains("hidden")'), "the save chip is shown with it");

  console.log("github harness: " + checks + " checks passed");
})().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
