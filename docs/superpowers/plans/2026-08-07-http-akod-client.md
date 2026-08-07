# HTTP A-kod Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Playwright/Chromium A-code retrieval with a direct HTTP/WebForms client that logs in from GitHub Secrets and preserves all existing queue/result/downstream contracts.

**Architecture:** Add a small CommonJS HTTP/WebForms module built on Node 20 `fetch`, with an in-memory cookie jar and pure HTML parsing helpers. Keep `script.js` as the queue runner, but make it call the HTTP client instead of Chromium. After tests pass, remove Playwright-specific workflow setup and dependency while leaving Dropbox/Supabase steps unchanged.

**Tech Stack:** Node.js 20, built-in `fetch`, `URLSearchParams`, `node:test`, GitHub Actions.

## Global Constraints

- `AKOD_USERNAME` and `AKOD_PASSWORD` remain GitHub Secrets/environment variables.
- Never persist or log ASP.NET session cookies.
- Create a fresh authenticated session for each workflow run.
- Preserve the current `results.json` schema and queue normalization.
- Do not change the webapp, Supabase schema, Dropbox formats, or Power Automate flow.
- A single row failure must not abort later queue rows unless login/session recovery fails globally.

---

### Task 1: WebForms parser and HTTP session client

**Files:**
- Create: `lib/webforms-client.js`
- Create: `test/webforms-client.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `extractHiddenFields(html)`, `extractAuthorisationId(html)`, `extractErrorMessage(html)`, `isLoginPage(html)`, `hasAuthorisationForm(html)`, and class `WebFormsClient` with `login()` and `authorise(tank, ref)`.
- `authorise()` returns `{ success, status, aKod, message }` without queue metadata.

- [ ] **Step 1: Write failing parser tests**

Use `node:test` fixtures that assert:

```js
assert.equal(extractHiddenFields('<input name="__VIEWSTATE" value="abc&amp;123">').__VIEWSTATE, 'abc&123');
assert.equal(extractAuthorisationId('<span id="MainContent_lblAuthorisationID">158726</span>'), '158726');
assert.equal(isLoginPage('<input id="MainContent_txtUserName">'), true);
assert.equal(hasAuthorisationForm('<input id="MainContent_txtUnitID"><input id="MainContent_txtReleaseNo">'), true);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test`
Expected: FAIL because `lib/webforms-client.js` does not exist.

- [ ] **Step 3: Implement parser helpers**

Implement HTML-entity decoding for `&amp;`, `&quot;`, `&#39;`, `&lt;`, `&gt;` and numeric entities. Extract `__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `__VIEWSTATEENCRYPTED`, and `__EVENTVALIDATION` by input `name`, regardless of attribute order. Extract the A-code specifically from `id="MainContent_lblAuthorisationID"`.

- [ ] **Step 4: Add mocked HTTP tests**

Mock `fetch` to prove this sequence and cookie reuse:

```text
GET /Login.aspx -> Set-Cookie ASP.NET_SessionId=abc -> login form + state
POST /Login.aspx -> 200
GET /ServiceBooking.aspx -> authorisation form + fresh state
POST /ServiceBooking.aspx -> HTML with MainContent_lblAuthorisationID=158726
```

Assert that the POST login body contains `ctl00$MainContent$txtUserName`, `ctl00$MainContent$txtPassword`, `ctl00$MainContent$btnLogin=Login`, and that the authorisation POST contains `ctl00$MainContent$btnAuthorise=Authorise Service`, tank, release ref and fresh WebForms state.

- [ ] **Step 5: Implement `WebFormsClient` minimally**

Use built-in `fetch` and an in-memory cookie map populated from `Set-Cookie`. Each request sends the current `Cookie` header. `login()` must fail if a subsequent GET of `ServiceBooking.aspx` still contains the login form or lacks the unit/release inputs. `authorise()` must GET/restore the current authorisation form, POST the same form fields verified locally, return success when the A-code element exists, classify `Object reference not set to an instance of an object` as `Tekniskt fel`, and otherwise return a popup/error message or `Okänt eller vänteläge`.

- [ ] **Step 6: Run tests and commit**

Run: `npm test`
Expected: PASS.

Commit: `feat: add HTTP WebForms client`

---

### Task 2: Replace Playwright queue runner while preserving results contract

**Files:**
- Modify: `script.js`
- Create: `test/script.test.js`

**Interfaces:**
- Consumes: `WebFormsClient` from `lib/webforms-client.js`.
- Produces: the existing result object shape `{ id, tank, ref, success, status, aKod, message }` and writes `RESULT_FILE`/`./results.json`.

- [ ] **Step 1: Extract/test pure queue normalization and result mapping**

Tests must cover:

```js
cleanTank('DHIU 184551-9') === 'DHIU1845519'
cleanRef('75538510/4') === '75538510/4'
```

and verify that an invalid row produces `status: 'Ogiltig input'` without calling the HTTP client.

- [ ] **Step 2: Add runner test for row isolation**

Use a fake client where row 1 throws, row 2 returns pending, and row 3 succeeds. Assert all three result rows are emitted in order and only the global login failure aborts the run.

- [ ] **Step 3: Replace browser logic in `script.js`**

Keep queue loading, normalization, `makeResult`, output path and summary semantics. Instantiate `WebFormsClient` with `USERNAME`, `PASSWORD`, and `AKOD_LOGIN_URL`/derived base URL, call `login()` once, then call `authorise()` per valid row. Do not log credentials, cookies, VIEWSTATE or EVENTVALIDATION.

- [ ] **Step 4: Run tests and commit**

Run: `npm test`
Expected: PASS.

Commit: `refactor: run A-code queue over HTTP`

---

### Task 3: Simplify GitHub Actions and verify branch end-to-end

**Files:**
- Modify: `.github/workflows/akod.yml`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes existing secrets `AKOD_USERNAME`, `AKOD_PASSWORD`, `AKOD_LOGIN_URL` and existing Dropbox/Supabase secrets.
- Produces the same workflow artifacts and downstream sync files as before.

- [ ] **Step 1: Update npm test script and remove Playwright dependency**

Set:

```json
"scripts": {
  "test": "node --test"
}
```

Remove `playwright` from dependencies and regenerate `package-lock.json` with `npm install --package-lock-only` or equivalent lockfile-safe npm operation.

- [ ] **Step 2: Remove Playwright-only workflow steps**

Delete the browser cache step and `npx playwright install chromium`. Keep `npm ci`, queue download/validation, retry wrapper, results processing, Dropbox uploads, Supabase sync and artifacts unchanged.

- [ ] **Step 3: Add an explicit test step before live execution**

Add:

```yaml
- name: Run tests
  run: npm test
```

before `Run script with retry`.

- [ ] **Step 4: Run static verification**

Verify the branch files contain no `require('playwright')`, `playwright install`, or browser-cache references. Verify workflow still passes `AKOD_USERNAME`, `AKOD_PASSWORD`, `AKOD_LOGIN_URL`, `QUEUE_FILE`, and `RESULT_FILE` to `script.js`.

- [ ] **Step 5: Create/keep draft PR and run branch workflow**

Trigger the workflow on `feat/http-akod-client` with the existing seven-row Dropbox queue. Expected: login succeeds quickly, all queue rows reach `results.json`, and the workflow continues through duplicate detection, Dropbox upload, Supabase sync and notification artifact creation.

- [ ] **Step 6: Inspect actual workflow logs/artifact**

Confirm no secret/session values appear in logs. Download `akod-results` and verify every input ID 59-65 appears exactly once across `results.json`/duplicate handling as intended.

- [ ] **Step 7: Commit final workflow cleanup**

Commit: `ci: remove Playwright from A-code automation`

---

## Final verification

Run `npm test` and inspect the branch workflow. Do not merge. The PR remains draft until the user explicitly approves merge.