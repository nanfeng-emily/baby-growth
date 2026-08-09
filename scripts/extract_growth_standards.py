"""Extract the chart percentiles used by the app from WS/T 423-2022.

The PDF is kept outside the repository. This script prints JavaScript to
stdout so the generated data can be reviewed before it is committed.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pdfplumber


PERCENTILE_COLUMNS = {
    "p3": 1,
    "p10": 2,
    "p25": 3,
    "p50": 4,
    "p75": 5,
    "p90": 6,
    "p97": 7,
}
AGE_MONTHS_0_TO_7 = list(range(24)) + list(range(24, 82, 3))
AGE_MONTHS_HEAD = list(range(25)) + [27, 30, 33, 36]


def numeric_rows(table: list[list[str | None]]) -> list[list[float]]:
    rows: list[list[float]] = []
    for row in table[1:]:
        if len(row) < 8 or any(value is None for value in row[1:8]):
            continue
        try:
            rows.append([float(value) for value in row[1:8]])
        except (TypeError, ValueError):
            continue
    return rows


def read_tables(pdf: pdfplumber.PDF, parts: list[tuple[int, int]]) -> list[list[float]]:
    rows: list[list[float]] = []
    for page_index, table_index in parts:
        tables = pdf.pages[page_index].extract_tables()
        rows.extend(numeric_rows(tables[table_index]))
    return rows


def metric(months: list[int], rows: list[list[float]]) -> dict[str, list[float] | list[int]]:
    if len(months) != len(rows):
        raise ValueError(f"Expected {len(months)} rows, found {len(rows)}")
    result: dict[str, list[float] | list[int]] = {"months": months}
    for name, column in PERCENTILE_COLUMNS.items():
        result[name] = [row[column - 1] for row in rows]
    return result


def extract(pdf_path: Path) -> dict[str, object]:
    with pdfplumber.open(pdf_path) as pdf:
        standards = {
            "boy": {
                "weight": metric(AGE_MONTHS_0_TO_7, read_tables(pdf, [(6, 0), (7, 0)])),
                "height": metric(AGE_MONTHS_0_TO_7, read_tables(pdf, [(8, 1), (9, 0)])),
                "head": metric(AGE_MONTHS_HEAD, read_tables(pdf, [(20, 1), (21, 0)])),
            },
            "girl": {
                "weight": metric(AGE_MONTHS_0_TO_7, read_tables(pdf, [(7, 1), (8, 0)])),
                "height": metric(AGE_MONTHS_0_TO_7, read_tables(pdf, [(9, 1), (10, 0), (11, 0)])),
                "head": metric(AGE_MONTHS_HEAD, read_tables(pdf, [(21, 1), (22, 0)])),
            },
        }

    # Control values visible in the official tables, used to detect page drift.
    assert standards["boy"]["height"]["p3"][0] == 47.6
    assert standards["boy"]["height"]["p50"][0] == 51.2
    assert standards["girl"]["weight"]["p97"][0] == 4.1
    assert standards["boy"]["head"]["p50"][0] == 34.3
    return standards


def to_javascript(data: dict[str, object]) -> str:
    header = "// Generated from the official WS/T 423-2022 tables A.1, A.2, A.3, A.4, A.11 and A.12.\n"
    source = "// Source: https://www.nhc.gov.cn/cms-search/downFiles/e38068f0a62d4a1eb1bd451414444ec1.pdf\n"
    return header + source + "const STANDARDS = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        raise SystemExit("Usage: extract_growth_standards.py SOURCE_PDF [OUTPUT_JS]")
    data = extract(Path(sys.argv[1]))
    output = to_javascript(data)
    if len(sys.argv) == 3:
        Path(sys.argv[2]).write_text(output, encoding="utf-8")
    else:
        print(output, end="")
