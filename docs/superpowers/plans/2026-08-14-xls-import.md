# Legacy XLS Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse legacy DENGOT `.xls` traffic sheets in an isolated GitHub Actions workflow and hand `tank + ref` JSON back to Dropbox without persisting transport data in GitHub.

**Architecture:** A focused Python parser reads BIFF `.xls` with `xlrd`, finds the DENGOT Delivery section and the `Container No`/`Release No` columns by header text, validates and deduplicates rows, and writes JSON locally. A separate workflow handles Dropbox OAuth/download/upload and never touches the existing A-code workflow. Historical duplicate detection remains in Power Automate/SharePoint.

**Tech Stack:** Python 3.12, `xlrd==2.0.2`, stdlib `unittest`, GitHub Actions, Dropbox HTTP API.

## Global Constraints

- Keep `.github/workflows/akod.yml`, `script.js`, RoRo behavior, queue/results contracts, failure tracker, and Supabase flow unchanged.
- Never commit source `.xls`, parsed output, real tank numbers, or real release numbers.
- Never upload production XLS/JSON as GitHub artifacts.
- Never print extracted tank/ref values in Actions logs.
- GitHub keeps no historical dedupe/import state.
- SharePoint remains the source of truth for historical duplicate detection.
- Production trigger accepts only `.xls` paths below `/akod/import/`.
- Parsed output is uploaded below `/akod/parsed/` with a run-ID-based filename.

---

### Task 1: Parser behavior and tests

**Files:**
- Create: `xls_import.py`
- Create: `test/test_xls_import.py`
- Create: `requirements-xls.txt`

**Interfaces:**
- `cell_text(value) -> str`: normalize xlrd cell values without turning integer-looking numbers into `123.0`.
- `extract_delivery_rows(sheet) -> tuple[list[dict[str, str]], dict[str, int]]`: locate the DENGOT delivery table, validate/dedupe rows, return parsed records plus aggregate counters.
- `parse_workbook(path: str) -> tuple[list[dict[str, str]], dict[str, int]]`: open BIFF XLS and return the first usable DENGOT delivery section.
- CLI: `python xls_import.py --input <xls> --output <json>` writes JSON and prints aggregate counts only.

- [ ] **Step 1: Add the dependency pin**

Create `requirements-xls.txt`:

```text
xlrd==2.0.2
```

- [ ] **Step 2: Write failing parser tests using synthetic in-memory sheet doubles**

Cover: locating the section/header row, valid rows with slash/no-slash refs, numeric release cells, malformed row skipping, same-file dedupe, missing section/header failure, and zero-valid-row failure. Use only synthetic identifiers such as `TEST123456/7` and refs shaped like `71234567/8`; no production values.

Example test shape:

```python
class FakeSheet:
    def __init__(self, rows):
        self.rows = rows
        self.nrows = len(rows)
        self.ncols = max(len(r) for r in rows)

    def cell_value(self, row, col):
        return self.rows[row][col] if col < len(self.rows[row]) else ""


def test_extracts_and_deduplicates_delivery_rows():
    rows = [
        ["Delivery Details for DENGOT"],
        ["Container No", "Release No"],
        ["TEST123456/7", "71234567/8"],
        ["TEST123456/7", "71234567/8"],
        ["ABCD654321/0", 71234568.0],
    ]
    records, stats = extract_delivery_rows(FakeSheet(rows))
    assert records == [
        {"tank": "TEST123456/7", "ref": "71234567/8"},
        {"tank": "ABCD654321/0", "ref": "71234568"},
    ]
    assert stats["duplicates"] == 1
```

- [ ] **Step 3: Run the new tests and verify RED**

Run:

```bash
python -m unittest test.test_xls_import -v
```

Expected: failure because `xls_import.py` does not yet implement the required interfaces.

- [ ] **Step 4: Implement minimal parser**

Use exact validation contracts:

```python
TANK_RE = re.compile(r"^[A-Z]{4}[0-9]{6}/[0-9]$")
REF_RE = re.compile(r"^7[0-9]{7}(?:/[0-9])?$")
```

Scan for `Delivery Details for DENGOT`, then a later row containing both `Container No` and `Release No`. Stop parsing when the next section marker such as `Shunt Details for DENGOT` is encountered. Skip malformed rows without logging values. Raise `ParseError` if section/headers are absent or if no valid rows remain.

CLI output must be aggregate-only, for example:

```text
Parsed 3 row(s); skipped 1 malformed row(s); removed 0 duplicate row(s).
```

- [ ] **Step 5: Run parser tests and verify GREEN**

```bash
python -m unittest test.test_xls_import -v
```

Expected: all XLS parser tests pass.

- [ ] **Step 6: Commit parser task**

```bash
git add requirements-xls.txt xls_import.py test/test_xls_import.py
git commit -m "feat: parse legacy DENGOT xls files"
```

---

### Task 2: Isolated GitHub Actions workflow

**Files:**
- Create: `.github/workflows/xls-import.yml`
- Test: `test/test_xls_import.py` (path-validation unit tests if helper is placed in Python)

**Interfaces:**
- Events: `repository_dispatch.types = [xls-import]`, `workflow_dispatch`, `pull_request`.
- Repository-dispatch payload field: `github.event.client_payload.dropbox_path`.
- Manual input: `inputs.dropbox_path`.
- Production/manual output Dropbox path: `/akod/parsed/xls-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.json`.

- [ ] **Step 1: Add a failing unit test for trigger-path validation**

Expose `validate_dropbox_path(path: str) -> str` from `xls_import.py`. Tests must accept `/akod/import/example.xls` case-insensitively for the extension and reject traversal, other folders, blank paths, and `.xlsx`.

```python
def test_validate_dropbox_path_rejects_outside_import_folder():
    with self.assertRaises(ValueError):
        validate_dropbox_path("/akod/other/example.xls")
```

- [ ] **Step 2: Run test and verify RED**

```bash
python -m unittest test.test_xls_import -v
```

- [ ] **Step 3: Implement path validation**

Use POSIX normalization and require the normalized path to begin exactly with `/akod/import/`, contain a real filename, and end with `.xls`. Do not log the payload value.

- [ ] **Step 4: Create `.github/workflows/xls-import.yml`**

Required structure:

```yaml
name: Legacy XLS import

on:
  repository_dispatch:
    types: [xls-import]
  workflow_dispatch:
    inputs:
      dropbox_path:
        description: Dropbox path below /akod/import/
        required: true
        type: string
  pull_request:
    paths:
      - xls_import.py
      - requirements-xls.txt
      - test/test_xls_import.py
      - .github/workflows/xls-import.yml

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: requirements-xls.txt
      - run: pip install -r requirements-xls.txt
      - run: python -m unittest test.test_xls_import -v

  process:
    if: github.event_name != 'pull_request'
    needs: test
    runs-on: ubuntu-latest
```

The `process` job obtains the same Dropbox refresh-token credentials already used by the A-code workflow, validates the input path before any download, downloads to a neutral local filename such as `input.xls`, parses to `parsed.json`, and uploads with Dropbox WriteMode overwrite to `/akod/parsed/xls-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.json`.

Do not add `actions/upload-artifact`, `cat parsed.json`, `cat input.xls`, or shell tracing.

- [ ] **Step 5: Verify workflow syntax locally**

Parse the YAML with a safe YAML parser or Ruby/Python available in the dev environment and inspect the workflow text for forbidden logging/artifact patterns.

- [ ] **Step 6: Run both Python and existing Node test suites**

```bash
python -m unittest test.test_xls_import -v
npm test
```

Expected: all new tests pass and all existing A-code tests remain green.

- [ ] **Step 7: Commit workflow task**

```bash
git add .github/workflows/xls-import.yml xls_import.py test/test_xls_import.py
git commit -m "feat: add isolated legacy xls workflow"
```

---

### Task 3: Real-file local smoke test and privacy review

**Files:**
- No production file additions.
- No production data committed.

**Interfaces:**
- Input: current Dropbox `.xls` sample downloaded to an untracked temporary path outside the repository.
- Output: temporary local JSON outside the repository, deleted after verification.

- [ ] **Step 1: Download the current Dropbox sample outside the repo**

Use a temporary single-use Dropbox download URL and save it outside the git worktree.

- [ ] **Step 2: Parse the real legacy XLS locally**

```bash
python xls_import.py --input /tmp/dengot-sample.xls --output /tmp/dengot-parsed.json
```

Expected: success and exactly 3 valid rows for the current sample; stdout contains counts only, never values.

- [ ] **Step 3: Validate output privately**

Programmatically assert `/tmp/dengot-parsed.json` contains the expected three `tank/ref` combinations already observed from the Dropbox file. Do not paste them into repo files or Actions logs.

- [ ] **Step 4: Remove temporary local data**

```bash
rm -f /tmp/dengot-sample.xls /tmp/dengot-parsed.json
```

- [ ] **Step 5: Review branch diff and privacy constraints**

Confirm changed production files are limited to the new parser/workflow/dependency/test plus design/plan docs, and confirm `.github/workflows/akod.yml` and `script.js` are unchanged versus `main`.

- [ ] **Step 6: Final verification**

```bash
python -m unittest test.test_xls_import -v
npm test
git diff --check main...HEAD
```

Expected: all green; no whitespace errors; no production tank/ref values in tracked files.

- [ ] **Step 7: Open a PR but do not merge**

PR summary must state that automatic Power Automate dispatch/writeback remains disabled until the workflow is merged and a manual post-merge smoke test has confirmed Dropbox output and log privacy.
