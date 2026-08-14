# Repeated Object Reference Skip Tracking — Design

## Goal

Stop stale or invalid tank/ref combinations from being retried forever when Älvsborg RoRo repeatedly returns exactly `Object reference not set to an instance of an object`.

## Safety constraints

- Do not change the existing queue format, RoRo login flow, normal `Väntar` handling, successful A-code handling, Dropbox results upload, Supabase sync contract, or duplicate detection.
- Track failures by normalized `tank + ref`, never tank alone.
- A new ref for the same tank is a new combination with a fresh counter.
- Count at most one matching failure per calendar day.
- Only the exact message `Object reference not set to an instance of an object` contributes to the tracker.
- Any non-matching outcome for the same tank/ref clears that combination from the tracker.
- On the third distinct failure day, return `status: "Skipped"` for that queue item.
- Once a combination is already skipped, later workflow runs must avoid calling RoRo for it and immediately return `Skipped`.

## Persistence

Use a small `failure_tracker.json` file in Dropbox alongside the existing queue/results files. The workflow downloads it before running the script and uploads the updated file after processing.

If the tracker file does not exist yet, the workflow creates an empty local tracker (`{}`) and continues. This makes the feature safe to deploy without a new manually-created Dropbox file.

No new GitHub secret is required. The tracker Dropbox path is derived from the directory containing `DROPBOX_QUEUE_PATH`, with the filename `failure_tracker.json`.

## Tracker shape

```json
{
  "DHDU2355117__75487440/9": {
    "error": "Object reference not set to an instance of an object",
    "dates": ["2026-08-14", "2026-08-15"],
    "skipped": false
  }
}
```

The key uses the same normalization contract already used by the A-code script: tank contains only letters/digits; ref contains digits and `/`.

## Processing flow

For each queue row:

1. Normalize tank/ref exactly as today.
2. If tracker says this combination is already skipped, do not call RoRo. Emit `Skipped` immediately.
3. Otherwise call RoRo through the existing `WebFormsClient`.
4. If the result message exactly matches the target object-reference error:
   - add today's UTC date only if not already present;
   - when three distinct dates are present, set `skipped: true` and emit `Skipped`;
   - before three dates, preserve the existing RoRo result/status.
5. For any other returned outcome or thrown row-level error, clear the tracker entry for that combination so only repeated identical object-reference failures build a streak.
6. Write the updated tracker locally for workflow upload.

## Result contract

On the third failure day and on later runs for an already-skipped combination:

```json
{
  "success": false,
  "status": "Skipped",
  "aKod": null,
  "message": "Object reference not set to an instance of an object - skipped after 3 days"
}
```

All other result objects remain unchanged.

## Files to change

- `script.js`: load/save tracker, update per-row tracker state, pre-skip known combinations.
- `test/script.test.js`: regression tests for one-per-day counting, third-day skip, pre-skipping without RoRo call, new-ref isolation, and tracker reset on other outcomes.
- `.github/workflows/akod.yml`: download tracker safely before `script.js`, pass tracker path/date inputs, upload tracker after processing, and include it in the artifact.

## Verification

- Existing test suite must remain green.
- New tests must prove current behavior is unchanged for normal waiting and successful rows.
- Workflow changes must be additive and preserve current Dropbox/Supabase steps.
- Implementation stays on a feature branch until tests and review are complete; `main` is not modified during development.
