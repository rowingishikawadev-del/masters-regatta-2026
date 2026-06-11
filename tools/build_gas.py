#!/usr/bin/env python3
"""
build_gas.py — gas/shared/Shared.gs を各 GAS プロジェクトに配布するビルドスクリプト。

使い方:
  python3 tools/build_gas.py       # プロジェクトルートから実行
  make build-gas

出力先:
  gas/pdf_publisher/Shared.gs
  gas/judge_form_publisher/Shared.gs

各ファイルの先頭に AUTO-GENERATED ヘッダーを付与する。
直接編集は禁止。正本は gas/shared/Shared.gs。
"""

import os
import sys
from pathlib import Path

# --- パス定義 ---
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
SHARED_SRC = PROJECT_ROOT / "gas" / "shared" / "Shared.gs"
TARGETS = [
    PROJECT_ROOT / "gas" / "pdf_publisher" / "Shared.gs",
    PROJECT_ROOT / "gas" / "judge_form_publisher" / "Shared.gs",
]

HEADER = """\
// ⚠️ AUTO-GENERATED from gas/shared/Shared.gs — 直接編集禁止。make build-gas で再生成
//    正本: gas/shared/Shared.gs
//    生成コマンド: make build-gas  (python3 tools/build_gas.py)

"""


def main() -> int:
    if not SHARED_SRC.exists():
        print(f"ERROR: 正本が見つかりません: {SHARED_SRC}", file=sys.stderr)
        return 1

    src_content = SHARED_SRC.read_text(encoding="utf-8")
    output_content = HEADER + src_content

    success_count = 0
    for target in TARGETS:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(output_content, encoding="utf-8", newline="\n")
        print(f"生成: {target.relative_to(PROJECT_ROOT)}")
        success_count += 1

    print(f"\n✅ build-gas 完了: {success_count}/{len(TARGETS)} ファイルを生成しました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
