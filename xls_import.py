#!/usr/bin/env python3
import argparse
import json
import posixpath
import re
from pathlib import Path

TANK_RE = re.compile(r"^[A-Z]{4}[0-9]{6}/[0-9]$")
REF_RE = re.compile(r"^7[0-9]{7}(?:/[0-9])?$")
DROPBOX_FILE_ID_RE = re.compile(r"^id:[A-Za-z0-9_-]+$")
DELIVERY_SECTION = "delivery details for dengot"
SHUNT_SECTION = "shunt details for dengot"
CONTAINER_HEADER = "container no"
RELEASE_HEADER = "release no"


class ParseError(ValueError):
    pass


def cell_text(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _row_values(sheet, row_index):
    return [cell_text(sheet.cell_value(row_index, col)) for col in range(sheet.ncols)]


def extract_delivery_rows(sheet):
    section_row = None
    for row_index in range(sheet.nrows):
        row = _row_values(sheet, row_index)
        if any(value.casefold() == DELIVERY_SECTION for value in row):
            section_row = row_index
            break

    if section_row is None:
        raise ParseError("delivery section not found")

    header_row = None
    tank_col = None
    ref_col = None
    for row_index in range(section_row + 1, sheet.nrows):
        row = _row_values(sheet, row_index)
        folded = [value.casefold() for value in row]
        if any(value == SHUNT_SECTION for value in folded):
            break
        if CONTAINER_HEADER in folded and RELEASE_HEADER in folded:
            header_row = row_index
            tank_col = folded.index(CONTAINER_HEADER)
            ref_col = folded.index(RELEASE_HEADER)
            break

    if header_row is None:
        raise ParseError("required headers not found in delivery section")

    records = []
    seen = set()
    skipped = 0
    duplicates = 0

    for row_index in range(header_row + 1, sheet.nrows):
        row = _row_values(sheet, row_index)
        folded = [value.casefold() for value in row]
        if any(value == SHUNT_SECTION for value in folded):
            break

        tank = row[tank_col].strip().upper() if tank_col < len(row) else ""
        ref = row[ref_col].strip() if ref_col < len(row) else ""

        if not tank and not ref:
            continue

        if not TANK_RE.fullmatch(tank) or not REF_RE.fullmatch(ref):
            skipped += 1
            continue

        key = (tank, ref)
        if key in seen:
            duplicates += 1
            continue

        seen.add(key)
        records.append({"tank": tank, "ref": ref})

    if not records:
        raise ParseError("no valid delivery rows found")

    return records, {
        "parsed": len(records),
        "skipped": skipped,
        "duplicates": duplicates,
    }


def parse_workbook(path):
    import xlrd

    book = xlrd.open_workbook(path)
    for sheet_index in range(book.nsheets):
        sheet = book.sheet_by_index(sheet_index)
        try:
            return extract_delivery_rows(sheet)
        except ParseError as error:
            if str(error) == "delivery section not found":
                continue
            raise
    raise ParseError("delivery section not found")


def validate_dropbox_file_id(file_id):
    if not isinstance(file_id, str) or not DROPBOX_FILE_ID_RE.fullmatch(file_id):
        raise ValueError("invalid Dropbox file ID")
    return file_id


def validate_dropbox_path(path):
    if not isinstance(path, str) or not path or not path.startswith("/") or "\\" in path:
        raise ValueError("invalid Dropbox input path")

    segments = path.split("/")
    if ".." in segments:
        raise ValueError("invalid Dropbox input path")

    normalized = posixpath.normpath(path)
    prefix = "/akod/import/"
    if not normalized.startswith(prefix):
        raise ValueError("invalid Dropbox input path")

    filename = posixpath.basename(normalized)
    if not filename or not filename.lower().endswith(".xls"):
        raise ValueError("invalid Dropbox input path")

    return normalized


def _main():
    parser = argparse.ArgumentParser(description="Parse legacy DENGOT XLS traffic sheets")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    records, stats = parse_workbook(args.input)
    Path(args.output).write_text(
        json.dumps(records, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        f"Parsed {stats['parsed']} row(s); "
        f"skipped {stats['skipped']} malformed row(s); "
        f"removed {stats['duplicates']} duplicate row(s)."
    )


if __name__ == "__main__":
    _main()
