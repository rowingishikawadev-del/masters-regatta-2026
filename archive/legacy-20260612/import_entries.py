#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MASTER_JSON = ROOT / "data" / "master.json"
ENTRIES_CSV = ROOT / "sample_csv" / "entries.csv"

LINE_RE = re.compile(
    r"^(?P<date>\d{4}/\d{1,2}/\d{1,2})\s+"
    r"(?P<time>\d{1,2}:\d{2})\s+"
    r"(?P<race_no>\d+)\s+"
    r"(?P<lane>\d+)\s+"
    r"(?P<event_name>\S+)\s+"
    r"(?P<category>[A-N])(?:\([^)]*\))?\s+"
    r"(?P<tail>.+?)\s+"
    r"(?P<self_boat>[01])$"
)
PAREN_PATTERNS = (
    re.compile(r"\(([^()]+)\)\s*$"),
    re.compile(r"（([^（）]+)）\s*$"),
)
HEADER_PREFIXES = (
    "第17回全日本マスターズレガッタ",
    "ver",
    "vｅr",
    "ｖｅｒ",
    "日時",
)
AFFILIATION_SUFFIXES = (
    "クラブ",
    "ローイングクラブ",
    "マスターズ",
    "漕艇クラブ",
    "ボートクラブ",
    "ボートクラブシニア",
    "会",
    "会議",
    "議会",
    "連合",
    "シニア",
)


def normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    normalized = normalized.replace("\u3000", " ")
    return normalized


def repeated_halves(value: str) -> str | None:
    parts = value.split()
    if len(parts) >= 2 and len(parts) % 2 == 0:
        midpoint = len(parts) // 2
        if parts[:midpoint] == parts[midpoint:]:
            return " ".join(parts[:midpoint])
    return None


def extract_parenthetical_affiliation(value: str) -> str | None:
    for pattern in PAREN_PATTERNS:
        match = pattern.search(value)
        if match:
            candidate = match.group(1).strip()
            if re.fullmatch(r"[A-N]", candidate):
                continue
            return candidate
    return None


def split_by_column_spacing(value: str) -> str | None:
    parts = [part.strip() for part in re.split(r"\s{2,}", value) if part.strip()]
    if len(parts) >= 2:
        return parts[0]
    return None


def choose_known_affiliation(value: str, known_affiliations: set[str]) -> str | None:
    matches = [
        affiliation
        for affiliation in known_affiliations
        if value == affiliation or value.startswith(f"{affiliation} ")
    ]
    if not matches:
        return None
    return max(matches, key=len)


def looks_like_affiliation_token(token: str) -> bool:
    if token.endswith((")", "）")):
        return True
    if any(token.endswith(suffix) for suffix in AFFILIATION_SUFFIXES):
        return True
    if re.fullmatch(r"[A-Z0-9.+-]+", token):
        return True
    upper = token.upper()
    if "RC" in upper or "R.C." in upper:
        return True
    return False


def split_by_affiliation_shape(value: str) -> str | None:
    tokens = value.split()
    if len(tokens) < 2:
        return None

    candidates: list[str] = []
    for idx in range(len(tokens) - 1):
        token = tokens[idx]
        if looks_like_affiliation_token(token):
            candidates.append(" ".join(tokens[: idx + 1]))

    if not candidates:
        return None
    return candidates[0]


def split_middle(value: str, known_affiliations: set[str]) -> str | None:
    if affiliation := split_by_column_spacing(value):
        return affiliation
    if affiliation := repeated_halves(value):
        return affiliation
    if affiliation := extract_parenthetical_affiliation(value):
        return affiliation
    if affiliation := split_by_affiliation_shape(value):
        return affiliation
    if affiliation := choose_known_affiliation(value, known_affiliations):
        return affiliation
    tokens = value.split()
    # Fallback: if first token looks reasonable, use it as affiliation
    if tokens:
        first_token = tokens[0]
        # Accept first token if it doesn't contain only alphanumeric/symbols
        # (likely a Japanese organization name)
        if len(first_token) > 0 and not re.fullmatch(r"[A-Z0-9.+-]+", first_token):
            return first_token
    if len(tokens) == 2:
        return tokens[0]
    return None


def parse_lines(raw_text: str) -> list[dict[str, object]]:
    normalized_lines = [
        normalize_text(line).strip()
        for line in raw_text.splitlines()
        if normalize_text(line).strip()
    ]

    parsed_rows: list[dict[str, object]] = []
    known_affiliations: set[str] = set()
    pending: list[tuple[int, re.Match[str], str]] = []

    for index, line in enumerate(normalized_lines, start=1):
        lowered = line.lower()
        if lowered.startswith(HEADER_PREFIXES) or "レース番号" in line:
            continue

        match = LINE_RE.match(line)
        if not match:
            raise ValueError(f"行 {index}: 解析できません: {line}")

        tail = match.group("tail").strip()
        affiliation = split_middle(tail, known_affiliations)
        if affiliation:
            known_affiliations.add(affiliation)
            parsed_rows.append(build_row(match, affiliation, line_no=index))
        else:
            pending.append((index, match, tail))

    unresolved: list[str] = []
    for index, match, tail in pending:
        affiliation = choose_known_affiliation(tail, known_affiliations)
        if not affiliation:
            unresolved.append(f"行 {index}: affiliation を特定できません: {tail}")
            continue
        parsed_rows.append(build_row(match, affiliation, line_no=index))

    if unresolved:
        raise ValueError("\n".join(unresolved))

    return sorted(parsed_rows, key=lambda row: (row["race_no"], row["lane"]))


def build_row(match: re.Match[str], affiliation: str, line_no: int) -> dict[str, object]:
    return {
        "line_no": line_no,
        "date": match.group("date"),
        "time": match.group("time"),
        "race_no": int(match.group("race_no")),
        "lane": int(match.group("lane")),
        "event_name": match.group("event_name"),
        "category": match.group("category"),
        "affiliation": affiliation,
    }


def load_master_json() -> dict[str, object]:
    with MASTER_JSON.open(encoding="utf-8") as fh:
        return json.load(fh)


def validate_against_schedule(master: dict[str, object], rows: list[dict[str, object]]) -> None:
    schedule = {
        item["race_num"]: item
        for item in master.get("schedule", [])
    }

    errors: list[str] = []
    seen_pairs: set[tuple[int, int]] = set()

    for row in rows:
        race_no = row["race_no"]
        lane = row["lane"]
        if (race_no, lane) in seen_pairs:
            errors.append(f"race {race_no} lane {lane}: 重複エントリー")
            continue
        seen_pairs.add((race_no, lane))

        scheduled = schedule.get(race_no)
        if not scheduled:
            errors.append(f"race {race_no}: master.json に存在しません")
            continue

        if scheduled["date"] != row["date"]:
            errors.append(
                f"race {race_no}: date 不一致 ({row['date']} != {scheduled['date']})"
            )
        if scheduled["scheduled_time"] != row["time"]:
            errors.append(
                f"race {race_no}: time 不一致 ({row['time']} != {scheduled['scheduled_time']})"
            )
        if scheduled["event_name"] != row["event_name"]:
            errors.append(
                f"race {race_no}: event_name 不一致 ({row['event_name']} != {scheduled['event_name']})"
            )

    if errors:
        raise ValueError("\n".join(errors))


def validate_full_coverage(master: dict[str, object], rows: list[dict[str, object]]) -> None:
    expected = {item["race_num"] for item in master.get("schedule", [])}
    actual = {row["race_no"] for row in rows}
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    errors: list[str] = []
    if missing:
        errors.append(f"entries が不足している race_num: {missing[:20]}")
    if extra:
        errors.append(f"master.json に存在しない race_num: {extra[:20]}")
    if errors:
        raise ValueError("\n".join(errors))


def update_master_json(master: dict[str, object], rows: list[dict[str, object]]) -> None:
    entries_by_race: dict[int, list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        entries_by_race[row["race_no"]].append(
            {
                "lane": row["lane"],
                "affiliation": row["affiliation"],
                "category": row["category"],
            }
        )

    for race in master.get("schedule", []):
        entries = sorted(entries_by_race.get(race["race_num"], []), key=lambda item: item["lane"])
        race["entries"] = entries


def write_master_json(master: dict[str, object]) -> None:
    with MASTER_JSON.open("w", encoding="utf-8") as fh:
        json.dump(master, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def write_entries_csv(rows: list[dict[str, object]]) -> None:
    ENTRIES_CSV.parent.mkdir(parents=True, exist_ok=True)
    with ENTRIES_CSV.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["race_no", "lane", "affiliation", "category"])
        for row in rows:
            writer.writerow(
                [row["race_no"], row["lane"], row["affiliation"], row["category"]]
            )


def read_input(path: str | None) -> str:
    if path:
        return Path(path).read_text(encoding="utf-8")
    return sys.stdin.read()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", nargs="?", help="入力テキストファイル。省略時は stdin を使用")
    parser.add_argument("--allow-partial", action="store_true", help="全124レース未満でも書き出す")
    parser.add_argument("--dry-run", action="store_true", help="ファイルを書き換えず検証のみ実施")
    args = parser.parse_args()

    raw_text = read_input(args.input)
    if not raw_text.strip():
        raise SystemExit("入力テキストが空です")

    rows = parse_lines(raw_text)
    master = load_master_json()
    validate_against_schedule(master, rows)
    if not args.allow_partial:
        validate_full_coverage(master, rows)
    update_master_json(master, rows)
    if not args.dry_run:
        write_master_json(master)
        write_entries_csv(rows)
    action = "Validated" if args.dry_run else "Imported"
    print(f"{action} {len(rows)} entries for {len({row['race_no'] for row in rows})} races")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
