# Repeated Object Reference Skip Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop retrying the same tank/ref forever after the exact RoRo object-reference error has occurred on three distinct days.

**Architecture:** Keep the current queue/result contracts intact. Persist only a small `failure_tracker.json` beside the Dropbox queue, keyed by normalized tank+ref, and make `script.js` mutate that tracker while preserving all current non-target outcomes.

**Tech Stack:** Node.js 24, built-in `node:test`, GitHub Actions, Dropbox HTTP API.

## Global Constraints

- Do not change queue shape, RoRo login/authorise contract, normal `Väntar`, successful A-code handling, duplicate detection, results upload, or Supabase sync.
- Count only exact message `Object reference not set to an instance of an object`.
- Count max once per date per normalized tank+ref.
- Third distinct date emits `Skipped`; already-skipped entries bypass `authorise`.
- New ref for same tank is independent.
- No new GitHub secret.

---

### Task 1: Tracker behavior in `script.js`

**Files:**
- Modify: `script.js`
- Test: `test/script.test.js`

**Interfaces:**
- `runQueue({ rawQueue, client, failureTracker = {}, today }) -> Promise<Result[]>`
- Tracker key: `<NORMALIZED_TANK>__<NORMALIZED_REF>`

- [ ] Add failing tests for one-per-day counting, day-three skip, already-skipped bypass, new-ref isolation, and reset on a non-matching outcome.
- [ ] Run `node --test test/script.test.js` and confirm the new tests fail for missing behavior.
- [ ] Implement the minimal tracker logic while keeping existing `runQueue` callers valid.
- [ ] Run `node --test test/script.test.js` and confirm all script tests pass.

### Task 2: Dropbox persistence

**Files:**
- Modify: `script.js`
- Modify: `.github/workflows/akod.yml`

**Interfaces:**
- Local tracker path: `./failure_tracker.json`
- Env: `FAILURE_TRACKER_FILE`, `RUN_DATE`
- Dropbox tracker path: same directory as `DROPBOX_QUEUE_PATH`, filename `failure_tracker.json`

- [ ] Add tracker load/save helpers with an empty-object fallback for a missing local file.
- [ ] Add an additive workflow step to download the tracker; on Dropbox 409/not-found create `{}` locally instead of failing.
- [ ] Pass tracker file and current date into `script.js`.
- [ ] Upload the updated tracker with Dropbox overwrite mode after the script succeeds.
- [ ] Add `failure_tracker.json` to the existing artifact list.

### Task 3: Safety verification

**Files:**
- Review: `script.js`
- Review: `test/script.test.js`
- Review: `.github/workflows/akod.yml`

- [ ] Run the complete available Node test suite.
- [ ] Parse `.github/workflows/akod.yml` as YAML and inspect the diff against `main` to ensure only additive tracker wiring changed.
- [ ] Open a pull request from `feat/skip-repeated-object-reference` to `main`; do not merge until verification is complete.
