# Legacy XLS Import — Design

## Goal

Add a separate import path for legacy `.xls` traffic-sheet attachments without changing the existing A-code workflow.

Power Automate saves the raw attachment to Dropbox and triggers a dedicated GitHub Actions workflow. GitHub reads the `.xls`, extracts `Container No + Release No`, writes a small JSON result back to Dropbox, and exits. Power Automate then performs duplicate checking against the existing SharePoint list and creates only missing rows with `Status = Väntar`.

## Safety and privacy constraints

- Keep the existing `.github/workflows/akod.yml`, RoRo client, queue format, failure tracker, results handling, and Supabase flow unchanged.
- Do not commit tank numbers, release numbers, source `.xls` files, or parsed output to GitHub.
- Do not upload source or parsed data as GitHub Actions artifacts.
- Do not print extracted tank/ref values to Actions logs.
- GitHub keeps no import history and no dedupe state.
- SharePoint remains the source of truth for duplicate detection.
- Dropbox is the transient hand-off location between Power Automate and GitHub.

## Architecture

### 1. Power Automate — intake

The mail flow:

1. Gets the `.xls` attachment bytes.
2. Saves the attachment in Dropbox under `/akod/import/` using a unique filename so simultaneous or repeated emails cannot overwrite each other.
3. Calls GitHub `Create a repository dispatch event` with an event type dedicated to XLS import and passes the Dropbox input path in `client_payload`.

Power Automate does not attempt to open, convert, or interpret the legacy Excel file.

### 2. GitHub Actions — parser

Add a dedicated workflow, separate from `akod.yml`, triggered by:

- `repository_dispatch` for the XLS import event;
- `workflow_dispatch` for manual testing.

The workflow:

1. Checks out the repository.
2. Sets up Python with pip caching.
3. Installs only the parser dependencies needed for legacy `.xls` files.
4. Reuses the existing Dropbox OAuth secrets to obtain an access token.
5. Downloads only the Dropbox file path supplied by the trigger.
6. Runs the XLS parser.
7. Uploads the parsed JSON to `/akod/parsed/` with a unique filename.
8. Removes local source/output files when the job ends naturally with the ephemeral runner.

No `npm ci` step is required for this workflow, so the existing Node A-code dependency path stays untouched.

## XLS parser

Use Python with `xlrd` for the legacy BIFF `.xls` workbook format.

The parser reads the workbook as structured cells, not as flattened text. It locates the `Delivery Details for DENGOT` section and identifies the columns by their headers rather than fixed Excel coordinates:

- `Container No`
- `Release No`

For each delivery row, emit a record only when both values are present and valid enough to use downstream.

Expected output shape:

```json
[
  {
    "tank": "<container number>",
    "ref": "<release number>"
  }
]
```

Within a single workbook, exact duplicate `tank + ref` combinations are collapsed before output. This is only same-file dedupe; historical dedupe is intentionally not stored in GitHub.

If the required section or headers cannot be found, or no usable rows are found, the parser fails clearly instead of producing misleading data.

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

- Dropbox download failure: fail the XLS workflow; do not create parsed output.
- Invalid/non-XLS content: fail the parser; do not create parsed output.
- Missing delivery headers: fail with a clear non-sensitive message.
- Individual malformed rows: skip the row without printing its tank/ref to logs; report only aggregate skipped-row counts.
- Dropbox upload failure: fail the workflow so Power Automate never receives an incomplete result.
- SharePoint duplicate: normal skip in Power Automate, not an error.

## Files to add/change

- `.github/workflows/xls-import.yml` — isolated XLS import workflow.
- `xls_import.py` — legacy XLS parser.
- `requirements-xls.txt` — pinned parser dependency.
- `test/test_xls_import.py` — parser tests using generated/minimal test workbook fixtures that contain synthetic values only.

The existing A-code workflow and production parser files are not modified unless implementation proves a shared helper is strictly necessary; the default design is zero changes to them.

## Verification

- Existing A-code tests must remain green.
- New parser tests cover header discovery, normal rows, blank/malformed rows, and same-file duplicate removal.
- Test fixtures contain synthetic data only.
- A manual feature-branch workflow run uses the current Dropbox sample file to verify real legacy `.xls` parsing and Dropbox result upload.
- Live-run logs are reviewed to confirm no tank/ref values are printed.
- `main` is not modified until the isolated workflow has passed tests and a live run has been reviewed.
