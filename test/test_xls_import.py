import sys
import types
from pathlib import Path
import unittest
from unittest.mock import patch

from xls_import import (
    ParseError,
    cell_text,
    extract_delivery_rows,
    parse_workbook,
    validate_dropbox_file_id,
    validate_dropbox_path,
)


class FakeSheet:
    def __init__(self, rows, name="Sheet1"):
        self.rows = rows
        self.name = name
        self.nrows = len(rows)
        self.ncols = max((len(row) for row in rows), default=0)

    def cell_value(self, row, col):
        if row >= self.nrows or col >= len(self.rows[row]):
            return ""
        return self.rows[row][col]


class XlsImportTests(unittest.TestCase):
    def test_cell_text_keeps_integer_looking_numbers_without_decimal_suffix(self):
        self.assertEqual(cell_text(71234568.0), "71234568")
        self.assertEqual(cell_text(" 71234567/8 "), "71234567/8")

    def test_extracts_valid_delivery_rows_and_deduplicates_same_file(self):
        sheet = FakeSheet([
            ["IB480c - Traffic Sheets"],
            ["Delivery Details for DENGOT"],
            [""],
            ["Container No", "Trailer Reference", "Release No"],
            ["TEST123456/7", "", "71234567/8"],
            ["TEST123456/7", "", "71234567/8"],
            ["ABCD654321/0", "", 71234568.0],
            ["bad tank", "", "71234569"],
            ["Shunt Details for DENGOT"],
            ["WXYZ111111/1", "", "71234570"],
        ])

        records, stats = extract_delivery_rows(sheet)

        self.assertEqual(records, [
            {"tank": "TEST123456/7", "ref": "71234567/8"},
            {"tank": "ABCD654321/0", "ref": "71234568"},
        ])
        self.assertEqual(stats, {"parsed": 2, "skipped": 1, "duplicates": 1})

    def test_header_columns_can_appear_with_blank_cells_between_them(self):
        sheet = FakeSheet([
            ["Delivery Details for DENGOT"],
            ["Container No", "", "", "Release No"],
            ["ABCD123456/7", "", "", "71234567"],
        ])

        records, _ = extract_delivery_rows(sheet)

        self.assertEqual(records, [{"tank": "ABCD123456/7", "ref": "71234567"}])

    def test_missing_delivery_section_fails_without_returning_empty_output(self):
        sheet = FakeSheet([
            ["Container No", "Release No"],
            ["ABCD123456/7", "71234567"],
        ])

        with self.assertRaisesRegex(ParseError, "delivery section"):
            extract_delivery_rows(sheet)

    def test_missing_required_headers_fails(self):
        sheet = FakeSheet([
            ["Delivery Details for DENGOT"],
            ["Container No", "Something Else"],
            ["ABCD123456/7", "71234567"],
        ])

        with self.assertRaisesRegex(ParseError, "required headers"):
            extract_delivery_rows(sheet)

    def test_zero_valid_rows_fails(self):
        sheet = FakeSheet([
            ["Delivery Details for DENGOT"],
            ["Container No", "Release No"],
            ["invalid", "not-a-ref"],
        ])

        with self.assertRaisesRegex(ParseError, "no valid delivery rows"):
            extract_delivery_rows(sheet)

    def test_parse_workbook_skips_non_delivery_sheets_and_uses_matching_sheet(self):
        class FakeBook:
            def __init__(self, sheets):
                self.sheets = sheets
                self.nsheets = len(sheets)

            def sheet_by_index(self, index):
                return self.sheets[index]

        book = FakeBook([
            FakeSheet([["Collection Details for DENGOT"]], name="Cover"),
            FakeSheet([
                ["Delivery Details for DENGOT"],
                ["Container No", "Release No"],
                ["ABCD123456/7", "71234567"],
            ], name="Traffic"),
        ])
        fake_xlrd = types.SimpleNamespace(open_workbook=lambda _path: book)

        with patch.dict(sys.modules, {"xlrd": fake_xlrd}):
            records, stats = parse_workbook("ignored.xls")

        self.assertEqual(records, [{"tank": "ABCD123456/7", "ref": "71234567"}])
        self.assertEqual(stats["parsed"], 1)

    def test_workflow_suppresses_existing_node_test_output(self):
        workflow = Path(".github/workflows/xls-import.yml").read_text(encoding="utf-8")
        self.assertNotIn("run: npm test\n", workflow)
        self.assertIn("npm test > /tmp/npm-test.log 2>&1", workflow)

    def test_validate_dropbox_file_id_accepts_only_dropbox_file_ids(self):
        self.assertEqual(
            validate_dropbox_file_id("id:AbCd-_12"),
            "id:AbCd-_12",
        )

    def test_validate_dropbox_file_id_rejects_paths_and_malformed_values(self):
        rejected = [
            "",
            "/akod/import/traffic.xls",
            "AbCd-_12",
            "id:",
            "id:has spaces",
            "id:abc/def",
        ]
        for value in rejected:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    validate_dropbox_file_id(value)

    def test_validate_dropbox_path_accepts_only_legacy_xls_in_import_folder(self):
        self.assertEqual(
            validate_dropbox_path("/akod/import/traffic-sheet.xls"),
            "/akod/import/traffic-sheet.xls",
        )
        self.assertEqual(
            validate_dropbox_path("/akod/import/TRAFFIC.XLS"),
            "/akod/import/TRAFFIC.XLS",
        )

    def test_validate_dropbox_path_rejects_other_locations_formats_and_traversal(self):
        rejected = [
            "",
            "/akod/other/traffic.xls",
            "/akod/import/traffic.xlsx",
            "/akod/import/../traffic.xls",
            "/akod/import/",
            "akod/import/traffic.xls",
        ]
        for path in rejected:
            with self.subTest(path=path):
                with self.assertRaises(ValueError):
                    validate_dropbox_path(path)


if __name__ == "__main__":
    unittest.main()
