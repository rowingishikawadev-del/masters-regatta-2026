#!/usr/bin/env python3
import argparse
import html
import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# tools/ 内から同ディレクトリの common を import
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import find_race as _find_race_common, format_race_datetime as _format_race_datetime_common

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_PATH = ROOT / "print_templates" / "race_record_template.html"
MASTER_PATH = ROOT / "data" / "master.json"
RESULTS_DIR = ROOT / "data" / "results"
OUTPUT_DIR = ROOT / "print_templates"
CHROME_PATH = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")


ROUND_LABELS = {
    "FA": "決勝A",
    "FB": "決勝B",
    "FC": "決勝C",
    "F": "決勝",
    "SA": "準決A",
    "SB": "準決B",
    "SC": "準決C",
    "S": "準決",
    "R": "敗復",
    "RA": "敗復A",
    "RB": "敗復B",
    "H": "予選",
    "HA": "予選A",
    "HB": "予選B",
    "HC": "予選C",
}


DUMMY_RACE_1 = [
    {"rank": 1, "lane": 4, "crew_name": "ＲＣ神戸　なでしこＯｈバーン", "time_1000": "3:24.50"},
    {"rank": 2, "lane": 2, "crew_name": "愛知東郷ボートクラブ", "time_1000": "3:31.20"},
    {"rank": 3, "lane": 5, "crew_name": "瀬田漕艇クラブ", "time_1000": "3:34.80"},
    {"rank": 4, "lane": 1, "crew_name": "Ｅ．Ｒ．Ｃ．Ｃ", "time_1000": "3:38.10"},
    {"rank": 5, "lane": 3, "crew_name": "宮ヶ瀬", "time_1000": "3:42.60"},
    {"rank": 6, "lane": 6, "crew_name": "浜寺マスターズアマゾネスＢ", "time_1000": "3:48.30"},
]


def load_json(path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def find_race(master, race_no):
    try:
        return _find_race_common(master, race_no)
    except ValueError as e:
        raise SystemExit(str(e))


def load_results(race_no):
    path = RESULTS_DIR / f"race_{race_no:03d}.json"
    if not path.exists():
        return []
    data = load_json(path)
    results = data.get("results", [])
    return results if isinstance(results, list) else []


def format_race_datetime(date_value, time_value):
    return _format_race_datetime_common(date_value, time_value)


def normalize_result(item, entries_by_lane):
    lane = item.get("lane") or item.get("boat") or item.get("B") or ""
    try:
        lane_key = int(lane)
    except (TypeError, ValueError):
        lane_key = None
    entry = entries_by_lane.get(lane_key, {})
    crew_name = item.get("crew_name") or item.get("crew") or entry.get("crew_name", "")
    return {
        "rank": item.get("rank") or item.get("place") or "",
        "crew_name": crew_name,
        "lane": lane,
        "time_500": item.get("time_500") or item.get("500m") or "",
        "time_1000": item.get("time_1000") or item.get("1000m") or item.get("time") or "",
        "note": item.get("note") or item.get("remarks") or "",
    }


def build_results(race, raw_results, use_dummy):
    entries_by_lane = {int(entry["lane"]): entry for entry in race.get("entries", []) if entry.get("lane") is not None}
    if use_dummy and int(race["race_no"]) == 1:
        results = [normalize_result(item, entries_by_lane) for item in DUMMY_RACE_1]
    else:
        results = [normalize_result(item, entries_by_lane) for item in raw_results]
    while len(results) < 8:
        results.append({"rank": "", "crew_name": "", "lane": "", "time_500": "", "time_1000": "", "note": ""})
    return results[:8]


def render_section(template, name, rows):
    pattern = re.compile(r"{{#" + re.escape(name) + r"}}(.*?){{/" + re.escape(name) + r"}}", re.S)
    match = pattern.search(template)
    if not match:
        return template
    block = match.group(1)
    rendered = []
    for row in rows:
        rendered.append(render_values(block, row))
    return template[: match.start()] + "".join(rendered) + template[match.end() :]


def render_values(template, values):
    def replace(match):
        key = match.group(1).strip()
        return html.escape(str(values.get(key, "")), quote=True)

    return re.sub(r"{{\s*([A-Za-z0-9_]+)\s*}}", replace, template)


def render_html(race_no, use_dummy):
    master = load_json(MASTER_PATH)
    race = find_race(master, race_no)
    raw_results = load_results(race_no)
    results = build_results(race, raw_results, use_dummy)
    tournament = master.get("tournament", {})
    values = {
        "tournament_name": tournament.get("race_name", ""),
        "race_no": race.get("race_no", ""),
        "event_name": race.get("event_name", ""),
        "race_date": format_race_datetime(race.get("date", ""), race.get("time", "")),
        "race_time": format_race_datetime(race.get("date", ""), race.get("time", "")),
        "round_label": ROUND_LABELS.get(str(race.get("round", "")), str(race.get("round", ""))),
        "print_datetime": "print " + datetime.now().strftime("%Y/%m/%d %H:%M:%S"),
        "organizer": "石川県ボート協会",
    }
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    rendered = render_section(template, "results", results)
    return render_values(rendered, values)


def generate_pdf(race_no, use_dummy):
    html_path = Path(f"/tmp/race_{race_no:03d}_render.html")
    pdf_path = OUTPUT_DIR / f"{race_no}.pdf"
    rendered_html = render_html(race_no, use_dummy)
    html_path.write_text(rendered_html, encoding="utf-8")
    command = [
        str(CHROME_PATH),
        "--headless=new",
        "--disable-gpu",
        f"--user-data-dir=/tmp/race_pdf_chrome_profile_{race_no}",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_path}",
        f"file://{html_path}",
    ]
    try:
        subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except (subprocess.CalledProcessError, FileNotFoundError):
        write_pdf_fallback(pdf_path, race_no, use_dummy)
    return pdf_path


def pdf_text(value):
    return "<" + str(value).encode("utf-16-be").hex().upper() + ">"


def estimate_width(value, size):
    width = 0
    for char in str(value):
        width += size * (0.5 if ord(char) < 128 else 0.92)
    return width


def draw_text(ops, x, y, value, size=10, font="G", align="left"):
    value = str(value)
    if not value:
        return
    if align == "center":
        x -= estimate_width(value, size) / 2
    elif align == "right":
        x -= estimate_width(value, size)
    ops.append(f"BT /{font} {size} Tf {x:.2f} {y:.2f} Td {pdf_text(value)} Tj ET")


def draw_line(ops, x1, y1, x2, y2, width=0.7):
    ops.append(f"{width:.2f} w {x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S")


def draw_rect(ops, x, y, w, h, width=0.7):
    ops.append(f"{width:.2f} w {x:.2f} {y:.2f} {w:.2f} {h:.2f} re S")


def write_pdf_fallback(path, race_no, use_dummy):
    master = load_json(MASTER_PATH)
    race = find_race(master, race_no)
    results = build_results(race, load_results(race_no), use_dummy)
    tournament = master.get("tournament", {})
    page_w, page_h = 841.89, 595.28
    left, right, top = 28.35, 28.35, 566.93
    content_w = page_w - left - right
    ops = ["q"]

    draw_text(ops, left, top - 12, tournament.get("race_name", ""), 10, "G")
    race_datetime = format_race_datetime(race.get("date", ""), race.get("time", ""))

    draw_text(ops, page_w / 2, top - 8, "競漕記録", 34, "G", "center")
    draw_text(ops, page_w - right, top - 12, "print " + datetime.now().strftime("%Y/%m/%d %H:%M:%S"), 9, "G", "right")

    sig_w, sig_h = 68, 52
    sig_x, sig_y = page_w - right - sig_w * 3, top - 78
    for i, label in enumerate(("競漕委員長", "審判長", "主席判定員")):
        x = sig_x + sig_w * i
        draw_rect(ops, x, sig_y, sig_w, sig_h)
        draw_text(ops, x + sig_w / 2, sig_y + sig_h - 15, label, 9, "G", "center")

    draw_text(ops, left, top - 95, race_datetime, 13, "G")
    draw_text(ops, left + 58, top - 95, "レース時間", 11, "G")

    meta_y = top - 145
    draw_text(ops, left, meta_y + 20, "Race No.", 11, "G")
    draw_text(ops, left + 142, meta_y + 20, "レース時間", 11, "G")
    draw_text(ops, left + 280, meta_y + 20, race.get("event_name", ""), 13, "G")
    draw_text(ops, left, meta_y, race.get("race_no", ""), 14, "G")
    draw_text(ops, left + 142, meta_y, race_datetime, 13, "G")
    draw_text(ops, left + 280, meta_y, "ラウンド", 11, "G")
    draw_text(ops, left + 350, meta_y, ROUND_LABELS.get(str(race.get("round", "")), str(race.get("round", ""))), 13, "G")

    table_x, table_top = left, top - 175
    col_w = [46, 272, 42, 108, 108, content_w - 46 - 272 - 42 - 108 - 108]
    header_h, row_h = 28, 36
    table_h = header_h + row_h * 8
    y_bottom = table_top - table_h
    x = table_x
    draw_rect(ops, table_x, y_bottom, content_w, table_h)
    for w in col_w[:-1]:
        x += w
        draw_line(ops, x, y_bottom, x, table_top)
    draw_line(ops, table_x, table_top - header_h, table_x + content_w, table_top - header_h)
    for i in range(1, 8):
        y = table_top - header_h - row_h * i
        draw_line(ops, table_x, y, table_x + content_w, y)

    centers = []
    x = table_x
    for w in col_w:
        centers.append(x + w / 2)
        x += w
    for center, label in zip(centers, ("順位", "クルー名", "レーン", "500m", "1000m", "備考")):
        draw_text(ops, center, table_top - 18, label, 11, "G", "center")
    for i, row in enumerate(results):
        y = table_top - header_h - row_h * i - 23
        draw_text(ops, centers[0], y, row["rank"], 12, "G", "center")
        draw_text(ops, table_x + col_w[0] + 8, y, row["crew_name"], 12, "G")
        draw_text(ops, centers[2], y, row["lane"], 12, "G", "center")
        draw_text(ops, centers[3], y, row["time_500"], 12, "G", "center")
        draw_text(ops, centers[4], y, row["time_1000"], 12, "G", "center")
        draw_text(ops, centers[5], y, row["note"], 11, "G", "center")

    cond_y = y_bottom - 30
    cond = [("天候", 55), ("", 70), ("風向", 55), ("", 70), ("風速", 55), ("", 70)]
    x = table_x
    for label, w in cond:
        draw_rect(ops, x, cond_y, w, 23)
        draw_text(ops, x + w / 2, cond_y + 8, label, 11, "G", "center")
        x += w

    rem_y = cond_y - 65
    draw_rect(ops, table_x, rem_y, 60, 55)
    draw_rect(ops, table_x + 60, rem_y, content_w - 60, 55)
    draw_text(ops, table_x + 30, rem_y + 25, "備考", 11, "G", "center")
    draw_text(ops, page_w - right, 22, "主催　石川県ボート協会", 11, "G", "right")
    ops.append("Q")

    content = "\n".join(ops).encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /Font << /G 4 0 R /M 5 0 R >> >> /Contents 6 0 R >>",
        b"<< /Type /Font /Subtype /Type0 /BaseFont /HeiseiKakuGo-W5 /Encoding /UniJIS-UCS2-H /DescendantFonts [7 0 R] >>",
        b"<< /Type /Font /Subtype /Type0 /BaseFont /HeiseiMin-W3 /Encoding /UniJIS-UCS2-H /DescendantFonts [8 0 R] >>",
        b"<< /Length " + str(len(content)).encode("ascii") + b" >>\nstream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HeiseiKakuGo-W5 /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 5 >> /FontDescriptor 9 0 R >>",
        b"<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HeiseiMin-W3 /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 5 >> /FontDescriptor 10 0 R >>",
        b"<< /Type /FontDescriptor /FontName /HeiseiKakuGo-W5 /Flags 4 /FontBBox [-92 -250 1010 922] /ItalicAngle 0 /Ascent 752 /Descent -221 /CapHeight 752 /StemV 120 >>",
        b"<< /Type /FontDescriptor /FontName /HeiseiMin-W3 /Flags 6 /FontBBox [-123 -257 1001 910] /ItalicAngle 0 /Ascent 723 /Descent -241 /CapHeight 723 /StemV 80 >>",
    ]
    output = bytearray(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(output))
        output.extend(f"{i} 0 obj\n".encode("ascii"))
        output.extend(obj)
        output.extend(b"\nendobj\n")
    xref = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("ascii"))
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode("ascii"))
    path.write_bytes(output)


def main():
    parser = argparse.ArgumentParser(description="Generate race record PDF")
    parser.add_argument("race_no", type=int)
    parser.add_argument("--use-dummy", action="store_true")
    args = parser.parse_args()
    pdf_path = generate_pdf(args.race_no, args.use_dummy)
    print(pdf_path.relative_to(ROOT))


if __name__ == "__main__":
    main()
