#!/usr/bin/env python3
"""
新大会セットアップツール — 大会ごとに使い回せる対話式セットアップスクリプト

使い方:
  python3 tools/init_tournament.py                        # 対話式（tournament.config.json + CSV テンプレ生成）
  python3 tools/init_tournament.py --non-interactive      # 全デフォルト値で出力
  python3 tools/init_tournament.py --out /tmp/out.json   # 出力先を指定
  python3 tools/init_tournament.py --non-interactive --out /tmp/out.json

生成ファイル:
  - tournament.config.json       : SPEC §5 準拠の大会設定（--out で変更可）
  - master/schedule_template.csv : スケジュール入力用テンプレート
  - master/entries_template.csv  : エントリー入力用テンプレート
"""

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

# プロジェクトルートを特定
TOOLS_DIR   = Path(__file__).resolve().parent
PROJECT_DIR = TOOLS_DIR.parent

# tools/ 内から同ディレクトリの common を import
sys.path.insert(0, str(TOOLS_DIR))
from common import C

# デフォルト出力先
DEFAULT_CONFIG_PATH    = PROJECT_DIR / "tournament.config.json"
MASTER_DIR             = PROJECT_DIR / "master"
SCHEDULE_TEMPLATE_PATH = MASTER_DIR  / "schedule_template.csv"
ENTRIES_TEMPLATE_PATH  = MASTER_DIR  / "entries_template.csv"

# テンプレートCSVコピー元
SCHEDULE_SAMPLE = PROJECT_DIR / "test" / "csv" / "schedule_sample.csv"
ENTRIES_SAMPLE  = PROJECT_DIR / "test" / "csv" / "entries_sample.csv"


# ---------------------------------------------------------------------------
# ウィザード質問一覧（SPEC §5 全フィールド対応）
# ---------------------------------------------------------------------------
# 大会情報 (tournament)
#   Q01: tournament.id        例: 2026-masters
#   Q02: tournament.name      例: 第17回全日本マスターズレガッタ
#   Q03: tournament.venue     例: 石川県津幡漕艇競技場
#   Q04: tournament.dates     例: 2026-05-23,2026-05-24
# コース設定 (default_course)
#   Q05: default_course.length_m              例: 1000
#   Q06: default_course.measurement_points   例: 500,1000
# カテゴリ (categories)
#   Q07: categories           例: M,W,X
# ブランド (brand)
#   Q08: brand.primary_color  例: #2D4F2C
#   Q09: brand.accent_color   例: #C9A227
#   Q10: brand.font_family    例: Noto Sans JP, sans-serif
# デプロイ (deploy)
#   Q11: deploy.github_repo   例: owner/repo （空可）
#   Q12: deploy.pages_url     例: https://xxx.pages.dev （空可）
#   Q13: deploy.test_pages_url 例: https://test.pages.dev （空可）
# GAS設定 (gas) — 全て空可
#   Q14: gas.pdf_template_sheet_id
#   Q15: gas.pdf_output_folder_id
#   Q16: gas.pdf_archive_folder_id
#   Q17: gas.booklet_folder_id
#   Q18: gas.booklet_template_gid
#   Q19: gas.judge_template_sheet_id
#   Q20: gas.prep_folder_id
# ---------------------------------------------------------------------------

DEFAULTS = {
    "tournament_id":              "2026-masters",
    "tournament_name":            "第17回全日本マスターズレガッタ",
    "tournament_venue":           "石川県津幡漕艇競技場",
    "tournament_dates":           "2026-05-23,2026-05-24",
    "course_length_m":            "1000",
    "measurement_points":         "500,1000",
    "categories":                 "M,W,X",
    "brand_primary_color":        "#2D4F2C",
    "brand_accent_color":         "#C9A227",
    "brand_font_family":          "Noto Sans JP, sans-serif",
    "deploy_github_repo":         "",
    "deploy_pages_url":           "",
    "deploy_test_pages_url":      "",
    "gas_pdf_template_sheet_id":  "",
    "gas_pdf_output_folder_id":   "",
    "gas_pdf_archive_folder_id":  "",
    "gas_booklet_folder_id":      "",
    "gas_booklet_template_gid":   "",
    "gas_judge_template_sheet_id": "",
    "gas_prep_folder_id":         "",
}


def prompt(label: str, default: str) -> str:
    """ユーザーに入力を促し、Enterのみで default を返す。"""
    display_default = f" [{default}]" if default else " (空欄可)"
    try:
        value = input(f"{label}{display_default}: ").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        sys.exit(0)
    return value if value else default


def confirm(label: str, default_yes: bool = True) -> bool:
    """Y/n または y/N で確認。"""
    hint = "[Y/n]" if default_yes else "[y/N]"
    try:
        answer = input(f"{label} {hint}: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print()
        sys.exit(0)
    if answer == "":
        return default_yes
    return answer in ("y", "yes")


def collect_answers(non_interactive: bool) -> dict:
    """非対話モードはデフォルトをそのまま返す。対話モードは質問を順番に聞く。"""
    if non_interactive:
        return dict(DEFAULTS)

    ans = {}
    D = DEFAULTS

    print(f"\n{C.BOLD}{C.CYAN}=== 大会設定ウィザード (SPEC §5) ==={C.RESET}")
    print("Enter のみでデフォルト値を採用します。空欄可のフィールドはそのまま Enter でOK。\n")

    print(f"{C.BOLD}▶ 大会情報{C.RESET}")
    ans["tournament_id"]    = prompt("Q01 大会ID (英数ハイフン)", D["tournament_id"])
    ans["tournament_name"]  = prompt("Q02 大会名", D["tournament_name"])
    ans["tournament_venue"] = prompt("Q03 会場", D["tournament_venue"])
    ans["tournament_dates"] = prompt("Q04 開催日 (YYYY-MM-DD カンマ区切り)", D["tournament_dates"])

    print(f"\n{C.BOLD}▶ コース設定{C.RESET}")
    ans["course_length_m"]       = prompt("Q05 コース距離 (m)", D["course_length_m"])
    ans["measurement_points"]    = prompt("Q06 計測ポイント (m カンマ区切り・昇順)", D["measurement_points"])

    print(f"\n{C.BOLD}▶ カテゴリ{C.RESET}")
    ans["categories"] = prompt("Q07 カテゴリ (カンマ区切り)", D["categories"])

    print(f"\n{C.BOLD}▶ ブランド設定{C.RESET}")
    ans["brand_primary_color"] = prompt("Q08 メインカラー (HEX)", D["brand_primary_color"])
    ans["brand_accent_color"]  = prompt("Q09 アクセントカラー (HEX)", D["brand_accent_color"])
    ans["brand_font_family"]   = prompt("Q10 フォントファミリー", D["brand_font_family"])

    print(f"\n{C.BOLD}▶ デプロイ設定 (空欄可){C.RESET}")
    ans["deploy_github_repo"]     = prompt("Q11 GitHub リポジトリ (owner/repo)", D["deploy_github_repo"])
    ans["deploy_pages_url"]       = prompt("Q12 本番 Pages URL", D["deploy_pages_url"])
    ans["deploy_test_pages_url"]  = prompt("Q13 テスト Pages URL", D["deploy_test_pages_url"])

    print(f"\n{C.BOLD}▶ GAS 設定 (全て空欄可 — 実行後に Script Properties へ投入){C.RESET}")
    print("  ※ pdf_publisher / judge_form_publisher の Google Drive / Sheets ID を入力してください")
    ans["gas_pdf_template_sheet_id"]   = prompt("Q14 pdf_template_sheet_id", D["gas_pdf_template_sheet_id"])
    ans["gas_pdf_output_folder_id"]    = prompt("Q15 pdf_output_folder_id", D["gas_pdf_output_folder_id"])
    ans["gas_pdf_archive_folder_id"]   = prompt("Q16 pdf_archive_folder_id", D["gas_pdf_archive_folder_id"])
    ans["gas_booklet_folder_id"]       = prompt("Q17 booklet_folder_id", D["gas_booklet_folder_id"])
    ans["gas_booklet_template_gid"]    = prompt("Q18 booklet_template_gid", D["gas_booklet_template_gid"])
    ans["gas_judge_template_sheet_id"] = prompt("Q19 judge_template_sheet_id", D["gas_judge_template_sheet_id"])
    ans["gas_prep_folder_id"]          = prompt("Q20 prep_folder_id", D["gas_prep_folder_id"])

    return ans


def build_config(ans: dict) -> dict:
    """回答を SPEC §5 スキーマに変換する。"""
    dates = [d.strip() for d in ans["tournament_dates"].split(",") if d.strip()]
    measurement_points_raw = [p.strip() for p in ans["measurement_points"].split(",") if p.strip()]
    try:
        measurement_points = [int(p) for p in measurement_points_raw]
    except ValueError:
        print(
            f"{C.RED}[ERROR]{C.RESET} 計測ポイントは整数で入力してください: {ans['measurement_points']!r}",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        length_m = int(ans["course_length_m"].strip())
    except ValueError:
        print(
            f"{C.RED}[ERROR]{C.RESET} コース距離は整数で入力してください: {ans['course_length_m']!r}",
            file=sys.stderr,
        )
        sys.exit(1)

    categories = [c.strip() for c in ans["categories"].split(",") if c.strip()]

    return {
        "_spec": "tournament.config.json — SPEC §5 (docs/SPEC_phase3_config.md v1.1). このファイルは .gitignore 対象。example は tournament.config.example.json を参照。",
        "tournament": {
            "id":    ans["tournament_id"],
            "name":  ans["tournament_name"],
            "venue": ans["tournament_venue"],
            "dates": dates,
        },
        "default_course": {
            "length_m":            length_m,
            "measurement_points":  measurement_points,
        },
        "categories": categories,
        "brand": {
            "primary_color": ans["brand_primary_color"],
            "accent_color":  ans["brand_accent_color"],
            "font_family":   ans["brand_font_family"],
        },
        "deploy": {
            "github_repo":    ans["deploy_github_repo"],
            "pages_url":      ans["deploy_pages_url"],
            "test_pages_url": ans["deploy_test_pages_url"],
        },
        "gas": {
            "pdf_template_sheet_id":   ans["gas_pdf_template_sheet_id"],
            "pdf_output_folder_id":    ans["gas_pdf_output_folder_id"],
            "pdf_archive_folder_id":   ans["gas_pdf_archive_folder_id"],
            "booklet_folder_id":       ans["gas_booklet_folder_id"],
            "booklet_template_gid":    ans["gas_booklet_template_gid"],
            "judge_template_sheet_id": ans["gas_judge_template_sheet_id"],
            "prep_folder_id":          ans["gas_prep_folder_id"],
        },
    }


def write_config(config: dict, out_path: Path) -> None:
    """tournament.config.json を書き出す。"""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    json_str = json.dumps(config, ensure_ascii=False, indent=2) + "\n"
    out_path.write_text(json_str, encoding="utf-8")
    try:
        rel = out_path.relative_to(PROJECT_DIR)
    except ValueError:
        rel = out_path
    print(f"  {C.GREEN}→ {rel} を生成しました{C.RESET}")


def write_schedule_template() -> None:
    MASTER_DIR.mkdir(parents=True, exist_ok=True)
    comment_header = (
        "# レーススケジュール テンプレート\n"
        "# 列の説明:\n"
        "#   race_no   : レース番号（RowingTimerWebと一致させること）\n"
        "#   event_code: 種目コード（例: M_1X, W_2X, X_4+）\n"
        "#   event_name: 種目名（表示用）\n"
        "#   category  : M（男子）/ W（女子）/ X（混成）\n"
        "#   age_group : 年齢区分（A〜H、J=ジュニア、O=オープン等）\n"
        "#   round     : FA（決勝A）/ FB（決勝B）/ SF（準決勝）/ H（予選）/ RK（順位決定）\n"
        "#   date      : 開催日（YYYY-MM-DD形式）\n"
        "#   time      : 発艇時刻（HH:MM形式）\n"
    )
    if SCHEDULE_SAMPLE.is_file():
        sample_body = SCHEDULE_SAMPLE.read_text(encoding="utf-8")
        SCHEDULE_TEMPLATE_PATH.write_text(comment_header + sample_body, encoding="utf-8")
    else:
        body = (
            "race_no,event_code,event_name,category,age_group,round,date,time\n"
            "1,M_1X,男子シングルスカル,M,G,FA,2025-06-07,07:00\n"
            "2,W_1X,女子シングルスカル,W,G,FA,2025-06-07,07:08\n"
        )
        SCHEDULE_TEMPLATE_PATH.write_text(comment_header + body, encoding="utf-8")
    print(f"  {C.GREEN}→ {SCHEDULE_TEMPLATE_PATH.relative_to(PROJECT_DIR)} を出力しました{C.RESET}")


def write_entries_template() -> None:
    MASTER_DIR.mkdir(parents=True, exist_ok=True)
    comment_header = (
        "# エントリー情報 テンプレート\n"
        "# 列の説明:\n"
        "#   race_no    : race_no と一致させること\n"
        "#   lane       : レーン番号（1〜6程度）\n"
        "#   crew_name  : クルー名（シングル=選手名、ペア以上=「選手A / 選手B」形式）\n"
        "#   affiliation: 所属（チーム名・学校名等）\n"
    )
    if ENTRIES_SAMPLE.is_file():
        sample_body = ENTRIES_SAMPLE.read_text(encoding="utf-8")
        ENTRIES_TEMPLATE_PATH.write_text(comment_header + sample_body, encoding="utf-8")
    else:
        body = (
            "race_no,lane,crew_name,affiliation\n"
            "1,1,選手名A,所属クラブA\n"
            "1,2,選手名B,所属クラブB\n"
            "1,3,選手名C,所属クラブC\n"
            "2,1,選手名D,所属クラブA\n"
        )
        ENTRIES_TEMPLATE_PATH.write_text(comment_header + body, encoding="utf-8")
    print(f"  {C.GREEN}→ {ENTRIES_TEMPLATE_PATH.relative_to(PROJECT_DIR)} を出力しました{C.RESET}")


def show_next_steps(config_path: Path) -> None:
    print(f"\n{C.BOLD}{C.GREEN}=== セットアップ完了 ==={C.RESET}\n")
    print("次のステップ:")
    print(f"1. {C.CYAN}{config_path}{C.RESET} を確認・編集")
    print()
    print("2. 以下のファイルを編集してエントリーを入力:")
    print(f"   {C.CYAN}master/schedule_template.csv{C.RESET}  ← レーススケジュール")
    print(f"   {C.CYAN}master/entries_template.csv{C.RESET}   ← エントリー情報")
    print()
    print("3. 入力後、master.json を生成:")
    print(f"   {C.YELLOW}python3 tools/generate_master.py \\")
    print(f"     --schedule master/schedule_template.csv \\")
    print(f"     --entries  master/entries_template.csv  \\")
    print(f"     --output   data/master.json -y{C.RESET}")
    print()
    print("4. GAS Script Properties への投入:")
    print(f"   {C.YELLOW}# tournament.config.json の gas セクションを setupFromConfig() に貼り付ける{C.RESET}")
    print()
    print("5. GitHub Repository Variables を設定:")
    print(f"   {C.YELLOW}TOURNAMENT_START={C.RESET} (大会初日 YYYY-MM-DD)")
    print(f"   {C.YELLOW}TOURNAMENT_END  ={C.RESET} (大会翌日 YYYY-MM-DD)")
    print()
    print("6. 確認:")
    print(f"   {C.YELLOW}python3 tools/check_status.py{C.RESET}")
    print()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="tournament.config.json 生成ウィザード (SPEC §5)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "例:\n"
            "  python3 tools/init_tournament.py\n"
            "  python3 tools/init_tournament.py --non-interactive\n"
            "  python3 tools/init_tournament.py --non-interactive --out /tmp/tournament.config.json\n"
        ),
    )
    parser.add_argument(
        "--non-interactive",
        action="store_true",
        help="対話をスキップして全フィールドをデフォルト値で出力",
    )
    parser.add_argument(
        "--out",
        default=None,
        metavar="FILE",
        help=f"tournament.config.json の出力先 (省略時: {DEFAULT_CONFIG_PATH})",
    )
    parser.add_argument(
        "--no-csv",
        action="store_true",
        help="テンプレートCSVを生成しない",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    config_path = Path(args.out) if args.out else DEFAULT_CONFIG_PATH

    ans = collect_answers(non_interactive=args.non_interactive)
    config = build_config(ans)

    print()
    write_config(config, config_path)

    if not args.no_csv and not args.non_interactive:
        do_template = confirm("→ テンプレートCSVをコピーしますか？", default_yes=True)
        if do_template:
            write_schedule_template()
            write_entries_template()
    elif not args.no_csv and args.non_interactive:
        # non-interactive モードでは CSV も自動生成
        write_schedule_template()
        write_entries_template()

    show_next_steps(config_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
