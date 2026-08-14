# Legacy XLS Import — Design

## Goal

Add a separate import path for legacy `.xls` traffic-sheet attachments without changing the existing A-code workflow.

Power Automate saves the raw attachment to Dropbox and triggers a dedicated GitHub Actions workflow. GitHub reads the `.xls`, extracts `Container No + Release No`, writes a small JSON result back to Dropbox, and exits. Power Automate then performs duplicate checking against the existing SharePoint list and creates only missing rows with `Status = Väntar`.

## Safety and privacy constraints

- Keep the existing `.github/workflows/akod.yml`, RoRo client, queue format, failure tracker, results handling, and Supabase flow unchanged.
- Do not commit tank numbers, release numbers, source `.xls` files, or parsed output to GitHub.
- Do not upload source or parsed data as GitHub Actions artifacts.
- Do not print extracted tank/ref values to Actions logs.
- GitHub keeps no import history and no historical dedupe state.
- SharePoint remains the source of truth for duplicate detection.
- Dropbox is the transient hand-off location between Power Automate and GitHub.

## Architecture

### 1. Power Automate — intake

The mail flow:

1. Gets the `.xls` attachment bytes.
2. Saves the attachment in Dropbox under `/akod/import/` using a unique filename so simultaneous or repeated emails cannot overwrite each other.
3. Calls GitHub `Create a repository dispatch event` with event type `xls-import` and passes the Dropbox input path in `client_payload`.

Power Automate does not attempt to open, convert, or interpret the legacy Excel file.

### 2. GitHub Actions — parser

Add a dedicated workflow, separate from `akod.yml`, triggered by:

- `repository_dispatch` with event type `xls-import` for production;
- `workflow_dispatch` for manual smoke tests after the workflow exists on `main`;
- `pull_request` only for non-secret parser/test validation before merge.

The production/manual workflow:

1. Checks out the repository.
2. Sets up Python with pip caching.
3. Installs `xlrd==2.0.2` from a dedicated requirements file.
4. Reuses the existing Dropbox OAuth secrets to obtain an access token.
5. Accepts only an input path below `/akod/import/` whose filename ends in `.xls`; reject every other payload path before downloading.
6. Downloads only the supplied Dropbox file.
7. Runs the XLS parser.
8. Uploads the parsed JSON to `/akod/parsed/` using a filename based on the GitHub run ID, not source data.
9. Leaves source/output only on the ephemeral runner; no artifact upload is configured.

No `npm ci` step is required for this workflow, so the existing Node A-code dependency path stays untouched.

For `pull_request`, the workflow runs only unit tests and does not request Dropbox secrets, download production files, or upload parsed output.

## XLS parser

Use Python with `xlrd==2.0.2` for the legacy BIFF `.xls` workbook format.

The parser reads the workbook as structured cells, not flattened text. It locates the `Delivery Details for DENGOT` section and identifies columns by their headers rather than fixed Excel coordinates:

- `Container No`
- `Release No`

Normalize surrounding whitespace before validation. A row is usable only when:

- tank matches `^[A-Z]{4}[0-9]{6}/[0-9]$` after uppercasing;
- release number matches `^7[0-9]{7}(?:/[0-9])?$`.

Expected output shape:

```json
[
  {
    "tank": "<container number>",
    "ref": "<release number>"
  }
]
```

Within a single workbook, exact duplicate normalized `tank + ref` combinations are collapsed before output. This is only same-file dedupe; historical dedupe is intentionally not stored in GitHub.

If the required delivery section or headers cannot be found, or no usable rows are found, the parser exits non-zero instead of producing an empty/misleading hand-off file.

## Power Automate — SharePoint writeback

A second Power Automate flow watches `/akod/parsed/` for newly created JSON result files.

For each parsed `tank + ref` pair:

1. Query the existing A-code SharePoint list for the same tank and ref combination.
2. If the combination already exists, skip it.
3. If it does not exist, create a new list row:
   - `Title` = tank
   - `F_x00e4_rjeRef` = ref
   - `Status` = `Väntar`

This makes the imported row enter the existing A-code queue through the same path as other sources.

After the JSON has been processed successfully, Power Automate may delete the parsed hand-off file from Dropbox. Source `.xls` retention remains a Power Automate/Dropbox policy and is not handled by GitHub.

## Error handling

- Invalid trigger path: fail before any Dropbox download.
- Dropbox download failure: fail the XLS workflow; do not create parsed output.
- Invalid/non-XLS content: fail the parser; do not create parsed output.
- Missing delivery headers: fail with a clear non-sensitive message.
- Individual malformed rows: skip the row without printing tank/ref values; report only aggregate skipped-row counts.
- Zero valid rows: fail without producing parsed output.
- Dropbox upload failure: fail the workflow so Power Automate never receives an incomplete result.
- SharePoint duplicate: normal skip in Power Automate, not an error.

## Files to add/change

- `.github/workflows/xls-import.yml` — isolated XLS import workflow.
- `xls_import.py` — legacy XLS parser.
- `requirements-xls.txt` — contains the pinned `xlrd==2.0.2` dependency.
- `test/test_xls_import.py` — parser tests using generated/minimal test workbook fixtures with synthetic values only.

The existing A-code workflow and production parser files are not modified unless implementation proves a shared helper is strictly necessary; the default design is zero changes to them.

## Verification and rollout

- Existing A-code tests remain green.
- New parser tests cover section/header discovery, normal rows, blank/malformed rows, validation, same-file duplicate removal, and zero-valid-row failure.
- Test fixtures contain synthetic data only.
- PR validation runs without production secrets or data.
- Before merge, review the diff to confirm `akod.yml` and existing A-code runtime files are untouched.
- After merge but before enabling the automatic Power Automate repository-dispatch step, run `xls-import.yml` manually against the current Dropbox sample file.
- Review that smoke-test output in Dropbox and confirm Actions logs contain no tank/ref values.
- Only then enable the automatic Power Automate dispatch and parsed-file SharePoint writeback flows.
