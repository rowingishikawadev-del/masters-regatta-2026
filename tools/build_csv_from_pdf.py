#!/usr/bin/env python3
import csv
import re
import subprocess
import unicodedata
from collections import OrderedDict, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PDFS = [
    Path("/Users/ryuiyamada/Downloads/2026masters_schedule0511a (2).pdf"),
    Path("/Users/ryuiyamada/Downloads/2026masters_schedule0507b (1).pdf"),
]
SCHEDULE_CSV = ROOT / "tools" / "schedule.csv"
ENTRIES_CSV = ROOT / "tools" / "entries.csv"

EVENT_CODE_SUFFIX = {
    "シングルスカル": "1X",
    "ダブルスカル": "2X",
    "舵手付きフォア": "4+",
    "舵手付きクォドルプル": "4X+",
    "エイト": "8+",
    "ナックルフォア": "NF+",
}
EVENT_NAMES = sorted(
    [
        prefix + suffix
        for prefix in ("男子", "女子", "混成")
        for suffix in EVENT_CODE_SUFFIX
    ],
    key=len,
    reverse=True,
)


def normalize_text(value):
    return unicodedata.normalize("NFKC", value).replace("Ⅽ", "C").replace("ⅽ", "c")


def category_sort_key(cat):
    if "パラ" in cat:
        base = cat.replace("パラ", "")
        return (base, 1)
    return (cat, 0)


def aggregate_age_group(categories):
    unique = sorted(set(categories), key=category_sort_key)
    return "・".join(unique) if len(unique) > 1 else (unique[0] if unique else "")


def event_category(event_name):
    if event_name.startswith("男子"):
        return "M"
    if event_name.startswith("女子"):
        return "W"
    return "X"


def event_code(event_name):
    category = event_category(event_name)
    for suffix_name, code_suffix in EVENT_CODE_SUFFIX.items():
        if event_name.endswith(suffix_name):
            return category + code_suffix
    return ""


def extract_pdf_text(pdf_path):
    return subprocess.check_output(
        ["pdftotext", "-layout", str(pdf_path), "-"],
        text=True,
        encoding="utf-8",
    )


def parse_line(line):
    line = normalize_text(line).replace("\f", "")
    match = re.match(
        r"^\s*(\d{4}/\d{1,2}/\d{1,2})\s+(\d{1,2}:\d{2})\s+(\d+)\s+(\d+)\s+(.*?)\s+[01]\s*$",
        line,
    )
    if not match:
        return None

    date, time, race_no, lane, rest = match.groups()
    event_name = next((name for name in EVENT_NAMES if name in rest), None)
    if not event_name:
        return None

    after_event = rest.split(event_name, 1)[1].strip()
    category_match = re.match(r"^(Aパラ|[A-N]|パラ)\s+(.*)$", after_event)
    if not category_match:
        return None

    category, names = category_match.groups()
    parts = [part.strip() for part in re.split(r"\s{2,}", names) if part.strip()]
    affiliation = parts[0] if parts else ""
    crew_name = parts[1] if len(parts) > 1 else affiliation

    return {
        "race_no": int(race_no),
        "lane": int(lane),
        "event_name": event_name,
        "date": date,
        "time": time,
        "category": category,
        "affiliation": affiliation,
        "crew_name": crew_name,
    }


def parse_pdfs(pdf_paths):
    rows = []
    for pdf_path in pdf_paths:
        for line in extract_pdf_text(pdf_path).splitlines():
            row = parse_line(line)
            if row:
                rows.append(row)
    rows.sort(key=lambda row: (row["race_no"], row["lane"]))
    return rows


def build_outputs(entry_rows):
    races = OrderedDict()
    categories_by_race = defaultdict(list)
    entries = []

    for row in entry_rows:
        race_no = row["race_no"]
        if race_no not in races:
            races[race_no] = {
                "race_no": race_no,
                "event_code": event_code(row["event_name"]),
                "event_name": row["event_name"],
                "category": event_category(row["event_name"]),
                "age_group": "",
                "round": "FA",
                "date": row["date"],
                "time": row["time"],
                "course_length": "",
            }
        categories_by_race[race_no].append(row["category"])
        entries.append(
            {
                "race_no": race_no,
                "lane": row["lane"],
                "crew_name": row["crew_name"],
                "affiliation": row["affiliation"],
                "category": row["category"],
            }
        )

    schedule = []
    for race_no, race in races.items():
        race["age_group"] = aggregate_age_group(categories_by_race[race_no])
        schedule.append(race)

    return schedule, entries


def write_csv(path, fieldnames, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    missing = [str(path) for path in PDFS if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing PDF input(s): " + ", ".join(missing))

    entry_rows = parse_pdfs(PDFS)
    schedule, entries = build_outputs(entry_rows)

    write_csv(
        SCHEDULE_CSV,
        ["race_no", "event_code", "event_name", "category", "age_group", "round", "date", "time", "course_length"],
        schedule,
    )
    write_csv(
        ENTRIES_CSV,
        ["race_no", "lane", "crew_name", "affiliation", "category"],
        entries,
    )


if __name__ == "__main__":
    main()
