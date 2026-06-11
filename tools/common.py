#!/usr/bin/env python3
"""
tools/common.py — ツール共通ユーティリティ

このモジュールは tools/ 内の各スクリプトで重複していた定義を一本化する。
tools/ 内スクリプトから: from common import C, log_ok, ...
test/ 等から: sys.path.insert(0, str(TOOLS_DIR)) の後に import common
"""

import sys

# ---------------------------------------------------------------------------
# ANSIカラー定義（colorama不要）
# ---------------------------------------------------------------------------

class C:
    RESET  = "\033[0m"
    BOLD   = "\033[1m"
    GREEN  = "\033[32m"
    YELLOW = "\033[33m"
    CYAN   = "\033[36m"
    RED    = "\033[31m"
    GRAY   = "\033[90m"
    BLUE   = "\033[34m"


# ---------------------------------------------------------------------------
# 標準ログ関数
# ---------------------------------------------------------------------------

def log_info(msg: str) -> None:
    print(f"{C.CYAN}[INFO]{C.RESET}  {msg}")

def log_ok(msg: str) -> None:
    print(f"{C.GREEN}[OK]{C.RESET}    {msg}")

def log_warn(msg: str) -> None:
    print(f"{C.YELLOW}[WARN]{C.RESET}  {msg}")

def log_error(msg: str) -> None:
    print(f"{C.RED}[ERROR]{C.RESET} {msg}", file=sys.stderr)

def log_debug(msg: str) -> None:
    print(f"{C.GRAY}[DEBUG]{C.RESET} {msg}")

def log_section(msg: str) -> None:
    print(f"\n{C.BOLD}{C.CYAN}{'='*60}{C.RESET}")
    if msg:
        print(f"{C.BOLD}{C.CYAN}  {msg}{C.RESET}")

def log_title(msg: str) -> None:
    print(f"{C.BOLD}{C.CYAN}  {msg}{C.RESET}\n{'='*60}{C.RESET}\n")


# ---------------------------------------------------------------------------
# タイム変換ユーティリティ
# ---------------------------------------------------------------------------

def ms_to_formatted(ms: int) -> str:
    """
    ミリ秒 → 'M:SS.ss' 形式。
    例: 108220 → '1:48.22'
    """
    total_cs = ms // 10          # センチ秒（0.01秒単位）
    centisec = total_cs % 100
    total_sec = total_cs // 100
    sec = total_sec % 60
    minutes = total_sec // 60
    return f"{minutes}:{sec:02d}.{centisec:02d}"


# ---------------------------------------------------------------------------
# master.json のレース検索
# ---------------------------------------------------------------------------

def find_race(master: dict, race_no: int) -> dict:
    """
    master.json の schedule から race_no に一致するレースを返す。
    見つからない場合は ValueError を送出する。
    呼び出し側で SystemExit に変換が必要な場合は except ValueError で処理すること。
    """
    for race in master.get("schedule", []):
        if int(race.get("race_no", -1)) == race_no:
            return race
    raise ValueError(f"race_no {race_no} not found in master.json")


# ---------------------------------------------------------------------------
# レース日時フォーマット
# ---------------------------------------------------------------------------

def format_race_datetime(date_value, time_value) -> str:
    """
    date_value, time_value を受け取り 'YYYY/MM/DD　HH:MM' 形式で返す。
    date_value は 'YYYY-MM-DD' または 'YYYY/MM/DD' 形式を許容する。
    time_value は 'HH:MM' 形式を許容する。
    パースに失敗した場合は元の文字列をそのまま使う。
    """
    date_text = str(date_value or "").strip()
    time_text = str(time_value or "").strip()
    try:
        sep = "-" if "-" in date_text else "/"
        parts = [int(p) for p in date_text.split(sep)]
        if len(parts) == 3:
            date_text = f"{parts[0]:04d}/{parts[1]:02d}/{parts[2]:02d}"
    except ValueError:
        pass
    try:
        parts = [int(part) for part in time_text.split(":")]
        if len(parts) >= 2:
            time_text = f"{parts[0]:02d}:{parts[1]:02d}"
    except ValueError:
        pass
    return f"{date_text}　{time_text}".strip()
