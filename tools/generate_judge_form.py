import json
import os
import urllib.request

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import PageBreak, SimpleDocTemplate, Spacer, Table, TableStyle

    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False
    mm = 72 / 25.4


FONT_PATH = "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc"
FONT_BOLD_PATH = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"
MASTER_URL = "https://raw.githubusercontent.com/rowingishikawadev-del/masters-regatta-2026/main/data/master.json"

if HAS_REPORTLAB:
    pdfmetrics.registerFont(TTFont("Hiragino", FONT_PATH, subfontIndex=0))
    pdfmetrics.registerFont(TTFont("HiraginoBold", FONT_BOLD_PATH, subfontIndex=0))


def fetch_master():
    try:
        with urllib.request.urlopen(MASTER_URL, timeout=30) as response:
            body = response.read().decode("utf-8")
    except Exception:
        with open("data/master.json", encoding="utf-8") as f:
            body = f.read()
    with open("/tmp/master.json", "w", encoding="utf-8") as f:
        f.write(body)
    return json.loads(body)


def format_race_time(date, time):
    if not date:
        return ""

    parts = str(date).replace("-", "/").split("/")
    yyyy, month, day = parts[0], parts[1].zfill(2), parts[2].zfill(2)
    if time:
        time_parts = str(time).split(":")
        hour = time_parts[0].zfill(2)
        minute = (time_parts[1] if len(time_parts) > 1 else "00").zfill(2)
    else:
        hour, minute = "", ""

    return f"{yyyy}/{month}/{day}　{hour}:{minute}"


def normalize_date(value):
    if not value:
        return ""
    parts = str(value).replace("-", "/").split("/")
    if len(parts) != 3:
        return str(value).replace("-", "/")
    return f"{parts[0]}/{parts[1].zfill(2)}/{parts[2].zfill(2)}"


def build_race_page(race):
    elements = []
    race_time = format_race_time(race.get("date"), race.get("time"))
    age_group = race.get("age_group", "")

    header_data = [
        ["Race No.", "レース時間", "種目名", "カテゴリー"],
        [str(race.get("race_no", "")), race_time, race.get("event_name", ""), age_group],
    ]
    header_tbl = Table(header_data, colWidths=[30 * mm, 50 * mm, 80 * mm, 30 * mm])
    header_tbl.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Hiragino"),
                ("FONTSIZE", (0, 0), (-1, 0), 11),
                ("FONTSIZE", (0, 1), (-1, 1), 14),
                ("FONTNAME", (0, 1), (-1, 1), "HiraginoBold"),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.black),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    elements.append(header_tbl)
    elements.append(Spacer(1, 10 * mm))

    entries = sorted(race.get("entries", []), key=lambda e: e.get("lane", 0))
    lanes = [1, 2, 3, 4, 5, 6]
    lane_row = ["レーン"] + [str(lane) for lane in lanes]
    affiliation_row = ["団体名"]
    crew_row = ["クルー名"]
    category_row = ["カテゴリー"]

    for lane in lanes:
        entry = next((x for x in entries if x.get("lane") == lane), None)
        affiliation_row.append(entry.get("affiliation", "") if entry else "")
        crew_row.append(entry.get("crew_name", "") if entry else "")
        category_row.append(entry.get("category", "") if entry else "")

    data = [lane_row, affiliation_row, crew_row, category_row]
    col_widths = [25 * mm] + [27 * mm] * 6
    table = Table(data, colWidths=col_widths, rowHeights=[10 * mm, 22 * mm, 22 * mm, 12 * mm])
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Hiragino"),
                ("FONTSIZE", (0, 0), (0, -1), 11),
                ("FONTSIZE", (1, 0), (-1, 0), 13),
                ("FONTSIZE", (1, 1), (-1, 2), 11),
                ("FONTSIZE", (1, 3), (-1, 3), 14),
                ("FONTNAME", (1, 3), (-1, 3), "HiraginoBold"),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.black),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EEEEEE")),
            ]
        )
    )
    elements.append(table)
    return elements


def escape_pdf_text(text):
    return str(text).encode("utf-16-be").hex().upper()


def pdf_text(x, y, text, size=10, font="F1", align="left", max_chars=None, leading=None):
    if text is None:
        text = ""
    text = str(text)
    if max_chars and len(text) > max_chars:
        lines = [text[i : i + max_chars] for i in range(0, len(text), max_chars)]
    else:
        lines = [text]
    leading = leading or size + 2
    chunks = []
    for index, line in enumerate(lines[:3]):
        tx = x
        if align == "center":
            tx = x - min(len(line), max_chars or len(line)) * size * 0.25
        chunks.append(f"BT /{font} {size} Tf {tx:.2f} {y - index * leading:.2f} Td <{escape_pdf_text(line)}> Tj ET")
    return "\n".join(chunks)


def pdf_rect(x, y, w, h, width=0.5):
    return f"{width:.2f} w {x:.2f} {y:.2f} {w:.2f} {h:.2f} re S"


def pdf_line(x1, y1, x2, y2, width=0.3):
    return f"{width:.2f} w {x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S"


def fallback_page_stream(race):
    page_w, page_h = 595.28, 841.89
    left = 10 * mm
    top = page_h - 12 * mm
    commands = ["0 G 1 1 1 rg"]

    header_x = left
    header_y = top - 24 * mm
    header_h = 20 * mm
    header_widths = [30 * mm, 50 * mm, 80 * mm, 30 * mm]
    x_positions = [header_x]
    for width in header_widths[:-1]:
        x_positions.append(x_positions[-1] + width)
    commands.append(pdf_rect(header_x, header_y, sum(header_widths), header_h, 0.5))
    commands.append(pdf_line(header_x, header_y + header_h / 2, header_x + sum(header_widths), header_y + header_h / 2))
    for x in x_positions[1:]:
        commands.append(pdf_line(x, header_y, x, header_y + header_h))

    labels = ["Race No.", "レース時間", "種目名", "カテゴリー"]
    values = [
        race.get("race_no", ""),
        format_race_time(race.get("date"), race.get("time")),
        race.get("event_name", ""),
        race.get("age_group", ""),
    ]
    for i, label in enumerate(labels):
        cx = x_positions[i] + header_widths[i] / 2
        commands.append(pdf_text(cx, header_y + header_h - 8 * mm, label, 11, "F1", "center"))
        commands.append(pdf_text(cx, header_y + 5 * mm, values[i], 13, "F1", "center", max_chars=16))

    table_x = left
    table_y = header_y - 10 * mm - 66 * mm
    row_heights = [10 * mm, 22 * mm, 22 * mm, 12 * mm]
    col_widths = [25 * mm] + [27 * mm] * 6
    table_w = sum(col_widths)
    table_h = sum(row_heights)
    commands.append(pdf_rect(table_x, table_y, table_w, table_h, 0.5))

    y = table_y
    for height in row_heights[:-1]:
        y += height
        commands.append(pdf_line(table_x, y, table_x + table_w, y))
    x = table_x
    for width in col_widths[:-1]:
        x += width
        commands.append(pdf_line(x, table_y, x, table_y + table_h))

    entries = {entry.get("lane"): entry for entry in race.get("entries", [])}
    rows = [
        ["レーン"] + [str(lane) for lane in range(1, 7)],
        ["団体名"] + [entries.get(lane, {}).get("affiliation", "") for lane in range(1, 7)],
        ["クルー名"] + [entries.get(lane, {}).get("crew_name", "") for lane in range(1, 7)],
        ["カテゴリー"] + [entries.get(lane, {}).get("category", "") for lane in range(1, 7)],
    ]
    row_bottoms = [
        table_y + sum(row_heights[1:]),
        table_y + sum(row_heights[2:]),
        table_y + row_heights[3],
        table_y,
    ]
    x_lefts = [table_x]
    for width in col_widths[:-1]:
        x_lefts.append(x_lefts[-1] + width)

    for row_idx, row in enumerate(rows):
        row_h = row_heights[row_idx]
        baseline = row_bottoms[row_idx] + row_h / 2 - 4
        for col_idx, value in enumerate(row):
            col_w = col_widths[col_idx]
            size = 11
            max_chars = 8 if col_idx else None
            if row_idx == 0 and col_idx > 0:
                size = 13
            if row_idx == 3 and col_idx > 0:
                size = 14
            if row_idx in (1, 2) and col_idx > 0:
                baseline = row_bottoms[row_idx] + row_h - 8 * mm
            else:
                baseline = row_bottoms[row_idx] + row_h / 2 - 4
            commands.append(
                pdf_text(
                    x_lefts[col_idx] + col_w / 2,
                    baseline,
                    value,
                    size,
                    "F1",
                    "center",
                    max_chars=max_chars,
                    leading=size + 2,
                )
            )

    return "\n".join(commands).encode("utf-8")


def build_fallback_pdf(races, output_path):
    page_w, page_h = 595.28, 841.89
    objects = []

    def add_object(content):
        objects.append(content)
        return len(objects)

    font_obj = add_object(
        b"<< /Type /Font /Subtype /Type0 /BaseFont /HeiseiKakuGo-W5 "
        b"/Encoding /UniJIS-UTF16-H /DescendantFonts [ << /Type /Font "
        b"/Subtype /CIDFontType0 /BaseFont /HeiseiKakuGo-W5 "
        b"/CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 5 >> >> ] >>"
    )
    page_refs = []
    for race in races:
        stream = fallback_page_stream(race)
        content_obj = add_object(b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream")
        page_obj = add_object(
            f"<< /Type /Page /Parent 0 0 R /MediaBox [0 0 {page_w:.2f} {page_h:.2f}] "
            f"/Resources << /Font << /F1 {font_obj} 0 R >> >> /Contents {content_obj} 0 R >>".encode("ascii")
        )
        page_refs.append(page_obj)

    kids = " ".join(f"{page_ref} 0 R" for page_ref in page_refs)
    pages_obj = add_object(f"<< /Type /Pages /Kids [{kids}] /Count {len(page_refs)} >>".encode("ascii"))
    catalog_obj = add_object(f"<< /Type /Catalog /Pages {pages_obj} 0 R >>".encode("ascii"))

    for page_ref in page_refs:
        objects[page_ref - 1] = objects[page_ref - 1].replace(b"/Parent 0 0 R", f"/Parent {pages_obj} 0 R".encode("ascii"))

    data = bytearray(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")
    offsets = [0]
    for index, content in enumerate(objects, start=1):
        offsets.append(len(data))
        data.extend(f"{index} 0 obj\n".encode("ascii"))
        data.extend(content)
        data.extend(b"\nendobj\n")
    xref_offset = len(data)
    data.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    data.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        data.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    data.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_obj} 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    with open(output_path, "wb") as f:
        f.write(data)


def race_sort_key(race):
    race_no = race.get("race_no", 0)
    try:
        return int(race_no)
    except (TypeError, ValueError):
        return 0


def generate_for_date(date_str, schedule, output_path):
    normalized = normalize_date(date_str)
    target = sorted(
        [r for r in schedule if normalize_date(r.get("date", "")) == normalized],
        key=race_sort_key,
    )
    if not target:
        print(f"該当日のレースなし: {date_str}")
        return

    if not HAS_REPORTLAB:
        build_fallback_pdf(target, output_path)
        print(f"PDF生成完了: {output_path} ({len(target)}レース)")
        return

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
    )
    story = []
    for index, race in enumerate(target):
        story.extend(build_race_page(race))
        if index < len(target) - 1:
            story.append(PageBreak())
    doc.build(story)
    print(f"PDF生成完了: {output_path} ({len(target)}レース)")


def main():
    master = fetch_master()
    schedule = master.get("schedule", [])
    dates = (master.get("tournament") or {}).get("dates", [])
    out_dir = "print_templates/judge_form"
    os.makedirs(out_dir, exist_ok=True)

    for date in dates:
        normalized_date = normalize_date(date)
        date_for_name = normalized_date.replace("/", "-")
        out_path = os.path.join(out_dir, f"判定員帳票_{date_for_name}.pdf")
        generate_for_date(normalized_date, schedule, out_path)


if __name__ == "__main__":
    main()
