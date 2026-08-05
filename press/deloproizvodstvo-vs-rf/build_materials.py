#!/usr/bin/env python3
"""Генерация образца приказа и иллюстраций по ИД-2017 (приказ МО РФ № 170)."""

from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Mm, Pt, RGBColor, Twips
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
DOCX_DIR = ROOT / "docx"
IMG_DIR = ROOT / "images"
DOCX_DIR.mkdir(parents=True, exist_ok=True)
IMG_DIR.mkdir(parents=True, exist_ok=True)

FONT_REG = "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"
FONT_SANS = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
FONT_SANS_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"


def set_run_font(run, size=14, bold=False, name="Times New Roman"):
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)
    run.font.size = Pt(size)
    run.bold = bold
    run.font.color.rgb = RGBColor(0, 0, 0)


def set_paragraph_format(
    p,
    *,
    align=WD_ALIGN_PARAGRAPH.JUSTIFY,
    space_before=0,
    space_after=0,
    line_spacing=1.15,
    first_line=None,
    left=0,
    right=0,
):
    pf = p.paragraph_format
    pf.alignment = align
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    pf.line_spacing = line_spacing
    pf.left_indent = Cm(left)
    pf.right_indent = Cm(right)
    if first_line is None:
        pf.first_line_indent = Cm(0)
    else:
        pf.first_line_indent = Cm(first_line)


def add_centered(doc, text, *, size=14, bold=False, space_before=0, space_after=0, line_spacing=1.0):
    p = doc.add_paragraph()
    set_paragraph_format(
        p,
        align=WD_ALIGN_PARAGRAPH.CENTER,
        space_before=space_before,
        space_after=space_after,
        line_spacing=line_spacing,
    )
    run = p.add_run(text)
    set_run_font(run, size=size, bold=bold)
    return p


def add_body(doc, text, *, first_line=1.25, space_before=0, space_after=0, bold=False):
    p = doc.add_paragraph()
    set_paragraph_format(
        p,
        align=WD_ALIGN_PARAGRAPH.JUSTIFY,
        space_before=space_before,
        space_after=space_after,
        line_spacing=1.15,
        first_line=first_line,
    )
    run = p.add_run(text)
    set_run_font(run, size=14, bold=bold)
    return p


def add_empty(doc, count=1):
    for _ in range(count):
        p = doc.add_paragraph()
        set_paragraph_format(p, space_before=0, space_after=0, line_spacing=1.0)
        run = p.add_run("")
        set_run_font(run, size=14)


def set_section_a4_margins(section):
    # ИД-2017 п. 38: левое ≥ 30 мм, правое ≥ 10 мм, верхнее/нижнее ≥ 20 мм
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.left_margin = Mm(30)
    section.right_margin = Mm(15)
    section.top_margin = Mm(20)
    section.bottom_margin = Mm(20)


def draw_coat_of_arms_placeholder(draw, cx, cy, r=28):
    """Условное изображение герба (учебный образец — не гербовый бланк)."""
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(40, 40, 40), width=2)
    draw.polygon(
        [(cx, cy - r + 6), (cx + r - 8, cy + r - 10), (cx - r + 8, cy + r - 10)],
        outline=(40, 40, 40),
    )
    draw.line((cx - 8, cy + 2, cx + 8, cy + 2), fill=(40, 40, 40), width=2)


def build_sample_order_docx():
    doc = Document()
    set_section_a4_margins(doc.sections[0])

    # Нормальная зона для стиля
    style = doc.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(14)
    style._element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")

    add_centered(doc, "МИНИСТЕРСТВО ОБОРОНЫ РОССИЙСКОЙ ФЕДЕРАЦИИ", size=12, bold=True, space_after=0)
    add_centered(doc, "(Минобороны России)", size=12, bold=False, space_after=2)
    add_centered(doc, "ВОЙСКОВАЯ ЧАСТЬ 00000", size=14, bold=True, space_after=6)
    add_centered(doc, "ПРИКАЗ", size=16, bold=True, space_before=6, space_after=8)

    # Дата слева — номер справа (как на продольном бланке)
    p = doc.add_paragraph()
    set_paragraph_format(p, align=WD_ALIGN_PARAGRAPH.LEFT, space_before=0, space_after=0, line_spacing=1.0)
    tab_stops = p.paragraph_format.tab_stops
    # ширина текстового поля ≈ 210 - 30 - 15 = 165 мм
    tab_stops.add_tab_stop(Cm(16.5), WD_TAB_ALIGNMENT.RIGHT)
    run = p.add_run("«05» августа 2026 г.")
    set_run_font(run, size=14)
    run2 = p.add_run("\t№ 120")
    set_run_font(run2, size=14)

    add_centered(doc, "г. Москва", size=14, space_before=2, space_after=10)

    add_centered(
        doc,
        "Об организации делопроизводства\nв войсковой части 00000",
        size=14,
        bold=True,
        space_before=6,
        space_after=10,
        line_spacing=1.0,
    )

    add_body(
        doc,
        "В целях приведения организации делопроизводства в соответствие "
        "с Инструкцией по делопроизводству в Вооруженных Силах Российской Федерации "
        "(ИД-2017), утвержденной приказом Министра обороны Российской Федерации "
        "от 4 апреля 2017 г. № 170, обеспечения единого порядка создания, учета, "
        "хранения и контроля исполнения служебных документов,",
        first_line=1.25,
        space_after=6,
    )

    add_centered(doc, "ПРИКАЗЫВАЮ:", size=14, bold=True, space_before=4, space_after=8)

    points = [
        "Начальнику штаба войсковой части 00000 организовать изучение положений "
        "Инструкции по делопроизводству в Вооруженных Силах Российской Федерации "
        "(ИД-2017) со всеми должностными лицами, ответственными за ведение "
        "делопроизводства, в срок до 20 августа 2026 г.",
        "Назначить ответственным за ведение несекретного делопроизводства "
        "в войсковой части 00000 начальника строевого отделения "
        "капитана Иванова И.И.",
        "Утвердить Порядок оформления служебных документов в войсковой части 00000 "
        "(приложение к настоящему приказу).",
        "Должностным лицам при подготовке служебных документов применять шрифт "
        "Times New Roman размером № 14–16, устанавливать поля: левое — не менее 30 мм, "
        "правое — не менее 10 мм, верхнее и нижнее — не менее 20 мм, абзацный отступ — 1,25 см.",
        "Запретить использование для создания служебных документов ксерокопий "
        "гербовых бланков и изготовление гербовых бланков средствами вычислительной техники.",
        "Контроль за выполнением настоящего приказа возложить на начальника штаба "
        "войсковой части 00000.",
    ]
    for i, text in enumerate(points, 1):
        add_body(doc, f"{i}. {text}", first_line=1.25, space_after=4)

    add_empty(doc, 2)

    # Подписи: командир и начальник штаба (п. 56 ИД-2017)
    table = doc.add_table(rows=2, cols=2)
    table.autofit = True
    cells = [
        ("Командир войсковой части 00000\nполковник", "И. Сидоров"),
        ("Начальник штаба\nвойсковой части 00000\nподполковник", "П. Петров"),
    ]
    for row_idx, (left, right) in enumerate(cells):
        cell_l = table.rows[row_idx].cells[0]
        cell_r = table.rows[row_idx].cells[1]
        cell_l.text = ""
        cell_r.text = ""
        p_l = cell_l.paragraphs[0]
        set_paragraph_format(p_l, align=WD_ALIGN_PARAGRAPH.LEFT, line_spacing=1.0)
        for j, line in enumerate(left.split("\n")):
            if j:
                p_l.add_run("\n")
            run = p_l.add_run(line)
            set_run_font(run, size=14)
        p_r = cell_r.paragraphs[0]
        set_paragraph_format(p_r, align=WD_ALIGN_PARAGRAPH.RIGHT, line_spacing=1.0)
        # место для подписи + расшифровка
        run = p_r.add_run("____________  " + right)
        set_run_font(run, size=14)
        if row_idx == 0:
            # пустая строка между блоками подписей
            pass

    # Отступ между подписями
    add_empty(doc, 1)

    # Приложение — отдельная страница
    doc.add_page_break()
    p = doc.add_paragraph()
    set_paragraph_format(p, align=WD_ALIGN_PARAGRAPH.RIGHT, line_spacing=1.0)
    for line in (
        "Приложение",
        "к приказу командира",
        "войсковой части 00000",
        "от 5 августа 2026 г. № 120",
    ):
        if p.runs:
            p.add_run("\n")
        run = p.add_run(line)
        set_run_font(run, size=12)
    # ограничение длины строки ~10 см — выравнивание блока справа
    p.paragraph_format.left_indent = Cm(7)

    add_centered(
        doc,
        "ПОРЯДОК\nоформления служебных документов\nв войсковой части 00000",
        size=14,
        bold=True,
        space_before=18,
        space_after=12,
        line_spacing=1.0,
    )

    rules = [
        "Служебные документы оформляются на бланках установленной формы либо "
        "на стандартных листах бумаги формата А4 (210×297 мм).",
        "Каждый лист документа должен иметь поля: левое — не менее 30 мм, "
        "правое — не менее 10 мм, верхнее — не менее 20 мм, нижнее — не менее 20 мм.",
        "Текст набирается шрифтом Times New Roman размером № 14–16 через 1–2 межстрочных интервала.",
        "Первая строка абзаца печатается с отступом 1,25 см от левой границы текстового поля.",
        "Заголовок к тексту приказа центрируется, точка в конце не ставится.",
        "Текст приказа излагается от первого лица единственного числа; "
        "распорядительная часть начинается словом «ПРИКАЗЫВАЮ».",
        "Пункты нумеруются арабскими цифрами с точкой; подпункты — арабскими цифрами "
        "со скобкой или строчными буквами со скобкой.",
        "Визы на проектах приказов проставляются на оборотной стороне последнего листа "
        "первого экземпляра проекта в нижней его части.",
    ]
    for i, text in enumerate(rules, 1):
        add_body(doc, f"{i}. {text}", first_line=1.25, space_after=4)

    add_empty(doc, 1)
    p = doc.add_paragraph()
    set_paragraph_format(p, align=WD_ALIGN_PARAGRAPH.LEFT, line_spacing=1.0)
    run = p.add_run("―" * 12)
    set_run_font(run, size=14)

    out = DOCX_DIR / "01_obrazec_prikaza_ID-2017.docx"
    doc.save(out)
    return out


def build_memo_docx():
    doc = Document()
    set_section_a4_margins(doc.sections[0])
    style = doc.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(14)
    style._element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")

    add_centered(
        doc,
        "ПАМЯТКА\nпо оформлению приказа\nпо Инструкции по делопроизводству в ВС РФ (ИД-2017)",
        size=14,
        bold=True,
        space_after=12,
        line_spacing=1.0,
    )

    add_body(
        doc,
        "Нормативная основа: приказ Министра обороны Российской Федерации "
        "от 4 апреля 2017 г. № 170 «Об утверждении Инструкции по делопроизводству "
        "в Вооруженных Силах Российской Федерации» (ИД-2017), с изменениями "
        "(в т. ч. приказ МО РФ от 6 июля 2024 г. № 397).",
        first_line=1.25,
        space_after=8,
    )

    add_centered(doc, "1. Поля и технические параметры", size=14, bold=True, space_before=6, space_after=6)
    rows = [
        ("Параметр", "Требование ИД-2017"),
        ("Формат бумаги", "А4 (210×297 мм)"),
        ("Левое поле", "не менее 30 мм"),
        ("Правое поле", "не менее 10 мм"),
        ("Верхнее поле", "не менее 20 мм"),
        ("Нижнее поле", "не менее 20 мм"),
        ("Шрифт", "Times New Roman № 14–16 (для документов Министру обороны — № 16)"),
        ("Межстрочный интервал", "1–2"),
        ("Абзацный отступ", "1,25 см"),
        ("Выравнивание текста", "по ширине (по границам полей)"),
        ("Нумерация страниц", "со 2-й страницы, посередине верхнего поля, арабскими цифрами"),
    ]
    table = doc.add_table(rows=len(rows), cols=2)
    table.style = "Table Grid"
    for i, (a, b) in enumerate(rows):
        for j, val in enumerate((a, b)):
            cell = table.rows[i].cells[j]
            cell.text = ""
            p = cell.paragraphs[0]
            set_paragraph_format(p, align=WD_ALIGN_PARAGRAPH.LEFT, line_spacing=1.0)
            run = p.add_run(val)
            set_run_font(run, size=12, bold=(i == 0 or j == 0))

    add_centered(doc, "2. Реквизиты приказа (продольный бланк)", size=14, bold=True, space_before=12, space_after=6)
    requisites = [
        "изображение Государственного герба Российской Федерации (на гербовом бланке; "
        "на расстоянии 10 мм от верхнего края листа, по центру зоны реквизитов);",
        "наименование федерального органа исполнительной власти / воинской части;",
        "наименование вида документа — ПРИКАЗ;",
        "дата документа (словесно-цифровым способом) и регистрационный номер;",
        "место составления (издания) документа;",
        "заголовок к тексту (центрируется; точка в конце не ставится);",
        "текст (констатирующая часть + слово «ПРИКАЗЫВАЮ» + распорядительная часть);",
        "подпись (должность, воинское звание, собственноручная подпись, расшифровка);",
        "визы (на обороте последнего листа 1-го экземпляра проекта);",
        "отметка об исполнителе (оборот последнего листа, внизу слева).",
    ]
    for i, t in enumerate(requisites, 1):
        add_body(doc, f"{i}) {t}", first_line=1.25, space_after=2)

    add_centered(doc, "3. Структура текста приказа", size=14, bold=True, space_before=12, space_after=6)
    add_body(
        doc,
        "Констатирующая часть кратко излагает цели и основания издания приказа "
        "(«В целях…», «В соответствии…», «Во исполнение…»). Если приказ издается "
        "на основании другого документа, указываются его вид, автор, дата, номер и заголовок.",
        first_line=1.25,
        space_after=4,
    )
    add_body(
        doc,
        "Распорядительная часть отделяется словом «ПРИКАЗЫВАЮ» (прописными буквами) "
        "и содержит поручения с указанием исполнителей и сроков. Пункты нумеруются "
        "арабскими цифрами. Последний пункт, как правило, возлагает контроль "
        "за выполнением приказа.",
        first_line=1.25,
        space_after=4,
    )
    add_body(
        doc,
        "Приказы подписываются командиром (начальником) воинской части и начальником штаба. "
        "Если должность начальника штаба штатом не предусмотрена — командиром единолично.",
        first_line=1.25,
        space_after=8,
    )

    add_centered(doc, "4. Приложение к приказу", size=14, bold=True, space_before=6, space_after=6)
    add_body(
        doc,
        "Отметка о приложении оформляется в правом верхнем углу первого листа приложения "
        "(строки центрируются относительно самой длинной; длина строки не более 10 см):",
        first_line=1.25,
        space_after=4,
    )
    for line in (
        "Приложение",
        "к приказу командира",
        "войсковой части 00000",
        "от «__» ________ 20__ г. № ___",
    ):
        add_centered(doc, line, size=12, space_after=0, line_spacing=1.0)

    add_empty(doc, 1)
    add_body(
        doc,
        "Учебный характер материалов: образец носит справочно-методический характер. "
        "Для юридически значимых документов используйте гербовые бланки установленного "
        "образца и актуальную редакцию ИД-2017.",
        first_line=1.25,
        space_after=0,
    )

    out = DOCX_DIR / "02_pamyatka_oformlenie_prikaza.docx"
    doc.save(out)
    return out


def font(path, size):
    return ImageFont.truetype(path, size)


def build_order_preview_png():
    # A4 at 150 dpi ≈ 1240 x 1754
    W, H = 1240, 1754
    img = Image.new("RGB", (W, H), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    # поля: L30 R15 T20 B20 мм → при 150 dpi: 1 мм ≈ 5.905 px
    mm = 150 / 25.4
    L, R, T, B = int(30 * mm), int(15 * mm), int(20 * mm), int(20 * mm)

    # легкая рамка полей
    draw.rectangle((L, T, W - R, H - B), outline=(210, 210, 210), width=1)

    # подписи полей
    f_small = font(FONT_SANS, 16)
    draw.line((0, T, W, T), fill=(200, 80, 80), width=1)
    draw.line((L, 0, L, H), fill=(200, 80, 80), width=1)
    draw.line((W - R, 0, W - R, H), fill=(200, 80, 80), width=1)
    draw.line((0, H - B, W, H - B), fill=(200, 80, 80), width=1)

    draw.text((8, T + 4), "↑ 20 мм", fill=(180, 60, 60), font=f_small)
    draw.text((8, H - B - 22), "↓ 20 мм", fill=(180, 60, 60), font=f_small)
    # вертикальные подписи
    tmp = Image.new("RGBA", (120, 30), (0, 0, 0, 0))
    td = ImageDraw.Draw(tmp)
    td.text((0, 0), "← 30 мм", fill=(180, 60, 60), font=f_small)
    tmp_r = tmp.rotate(90, expand=True)
    img.paste(tmp_r, (4, H // 2 - 40), tmp_r)
    tmp2 = Image.new("RGBA", (120, 30), (0, 0, 0, 0))
    td2 = ImageDraw.Draw(tmp2)
    td2.text((0, 0), "15 мм →", fill=(180, 60, 60), font=f_small)
    tmp2_r = tmp2.rotate(270, expand=True)
    img.paste(tmp2_r, (W - 28, H // 2 - 40), tmp2_r)

    cx = (L + W - R) // 2
    y = T + int(8 * mm)
    draw_coat_of_arms_placeholder(draw, cx, y, r=32)
    y += 48

    f12 = font(FONT_BOLD, 22)
    f14 = font(FONT_REG, 26)
    f14b = font(FONT_BOLD, 26)
    f16b = font(FONT_BOLD, 32)
    f12r = font(FONT_REG, 22)

    def center_text(text, yy, fnt, gap=4):
        bbox = draw.textbbox((0, 0), text, font=fnt)
        tw = bbox[2] - bbox[0]
        draw.text((cx - tw // 2, yy), text, fill=(0, 0, 0), font=fnt)
        return yy + (bbox[3] - bbox[1]) + gap

    y = center_text("МИНИСТЕРСТВО ОБОРОНЫ", y, f12)
    y = center_text("РОССИЙСКОЙ ФЕДЕРАЦИИ", y, f12)
    y = center_text("(Минобороны России)", y + 2, f12r)
    y = center_text("ВОЙСКОВАЯ ЧАСТЬ 00000", y + 8, f14b)
    y = center_text("ПРИКАЗ", y + 16, f16b)

    # дата / номер
    y += 18
    draw.text((L + 10, y), "«05» августа 2026 г.", fill=(0, 0, 0), font=f14)
    num = "№ 120"
    nb = draw.textbbox((0, 0), num, font=f14)
    draw.text((W - R - 10 - (nb[2] - nb[0]), y), num, fill=(0, 0, 0), font=f14)
    y += 36
    y = center_text("г. Москва", y, f14)

    y += 20
    y = center_text("Об организации делопроизводства", y, f14b, gap=2)
    y = center_text("в войсковой части 00000", y, f14b)

    y += 18
    # абзац с отступом 1.25 см
    indent = int(12.5 * mm)
    body = (
        "В целях приведения организации делопроизводства в соответствие с Инструкцией "
        "по делопроизводству в Вооруженных Силах Российской Федерации (ИД-2017), "
        "утвержденной приказом Министра обороны Российской Федерации от 4 апреля 2017 г. № 170,"
    )
    # wrap
    def wrap_draw(text, x0, yy, width, fnt, first_indent=0):
        words = text.split()
        lines = []
        cur = ""
        for w in words:
            test = (cur + " " + w).strip()
            if draw.textbbox((0, 0), test, font=fnt)[2] <= width - (first_indent if not lines else 0):
                cur = test
            else:
                if cur:
                    lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        for i, line in enumerate(lines):
            xi = x0 + (first_indent if i == 0 else 0)
            draw.text((xi, yy), line, fill=(0, 0, 0), font=fnt)
            yy += 34
        return yy

    y = wrap_draw(body, L + 8, y, W - R - L - 16, f14, first_indent=indent)
    y += 10
    y = center_text("ПРИКАЗЫВАЮ:", y, f14b)
    y += 10

    points = [
        "1. Начальнику штаба организовать изучение ИД-2017 со всеми ответственными должностными лицами в срок до 20 августа 2026 г.",
        "2. Назначить ответственным за ведение несекретного делопроизводства капитана Иванова И.И.",
        "3. Утвердить Порядок оформления служебных документов (приложение к настоящему приказу).",
        "4. При подготовке документов применять Times New Roman № 14–16 и установленные размеры полей.",
        "5. Контроль за выполнением настоящего приказа возложить на начальника штаба войсковой части 00000.",
    ]
    for pt in points:
        y = wrap_draw(pt, L + 8, y, W - R - L - 16, f14, first_indent=indent)
        y += 8

    y += 30
    # подписи
    draw.multiline_text((L + 8, y), "Командир войсковой части 00000\nполковник", fill=(0, 0, 0), font=f14, spacing=4)
    sig = "____________  И. Сидоров"
    sb = draw.textbbox((0, 0), sig, font=f14)
    draw.text((W - R - 10 - (sb[2] - sb[0]), y + 20), sig, fill=(0, 0, 0), font=f14)

    y += 90
    draw.multiline_text((L + 8, y), "Начальник штаба\nвойсковой части 00000\nподполковник", fill=(0, 0, 0), font=f14, spacing=4)
    sig2 = "____________  П. Петров"
    sb2 = draw.textbbox((0, 0), sig2, font=f14)
    draw.text((W - R - 10 - (sb2[2] - sb2[0]), y + 30), sig2, fill=(0, 0, 0), font=f14)

    # легенда снизу
    note = "Учебный образец по ИД-2017 (приказ МО РФ от 04.04.2017 № 170). Красным обозначены минимальные поля."
    draw.rectangle((0, H - 36, W, H), fill=(245, 245, 245))
    draw.text((16, H - 28), note, fill=(80, 80, 80), font=f_small)

    out = IMG_DIR / "01_obrazec_prikaza.png"
    img.save(out, "PNG")
    return out


def build_margins_scheme_png():
    W, H = 1400, 1000
    img = Image.new("RGB", (W, H), (250, 248, 244))
    draw = ImageDraw.Draw(img)
    title_f = font(FONT_SANS_BOLD, 32)
    body_f = font(FONT_SANS, 22)
    small_f = font(FONT_SANS, 18)
    draw.text((40, 30), "Схема полей листа приказа (А4) — ИД-2017, п. 38", fill=(30, 30, 30), font=title_f)

    # page mockup
    px, py, pw, ph = 80, 100, 520, 735
    draw.rectangle((px, py, px + pw, py + ph), fill=(255, 255, 255), outline=(40, 40, 40), width=2)
    mm = pw / 210
    L, R, T, B = 30 * mm, 10 * mm, 20 * mm, 20 * mm
    # margin zones
    draw.rectangle((px, py, px + L, py + ph), fill=(255, 220, 220))
    draw.rectangle((px + pw - R, py, px + pw, py + ph), fill=(255, 220, 220))
    draw.rectangle((px, py, px + pw, py + T), fill=(255, 220, 220))
    draw.rectangle((px, py + ph - B, px + pw, py + ph), fill=(255, 220, 220))
    draw.rectangle((px + L, py + T, px + pw - R, py + ph - B), fill=(255, 255, 255), outline=(60, 60, 60), width=2)

    # labels on mockup
    draw.text((px + 6, py + ph // 2), "30\nмм", fill=(160, 40, 40), font=small_f)
    draw.text((px + pw - R + 2, py + ph // 2), "≥10\nмм", fill=(160, 40, 40), font=small_f)
    draw.text((px + pw // 2 - 30, py + 4), "≥ 20 мм", fill=(160, 40, 40), font=small_f)
    draw.text((px + pw // 2 - 30, py + ph - B + 4), "≥ 20 мм", fill=(160, 40, 40), font=small_f)

    # content lines inside
    tx = int(px + L + 20)
    ty = int(py + T + 40)
    for i in range(12):
        indent = 28 if i in (3, 5, 6, 7, 8) else 0
        draw.line((tx + indent, ty + i * 36, px + pw - R - 20, ty + i * 36), fill=(180, 180, 180), width=3)
    # first-line indent marker
    draw.line((tx, ty + 3 * 36 + 10, tx + 28, ty + 3 * 36 + 10), fill=(30, 100, 180), width=4)
    draw.text((tx, ty + 3 * 36 + 16), "абзацный отступ 1,25 см", fill=(30, 100, 180), font=small_f)

    # right panel
    rx = 660
    items = [
        ("Левое поле", "не менее 30 мм", "место для подшивки / переплета"),
        ("Правое поле", "не менее 10 мм", "в образце Word задано 15 мм"),
        ("Верхнее поле", "не менее 20 мм", "герб — 10 мм от верхнего края"),
        ("Нижнее поле", "не менее 20 мм", "колонтитулы / отметки"),
        ("Абзацный отступ", "1,25 см", "первая строка абзаца текста"),
        ("Шрифт", "Times New Roman 14–16", "документы Министру — № 16"),
        ("Интервал", "1–2 межстрочных", "заголовок многострочный — 1"),
        ("Формат", "А4 210×297 мм", "продольный бланк приказа"),
    ]
    y = 110
    for title, val, note in items:
        draw.rounded_rectangle((rx, y, W - 40, y + 78), radius=10, fill=(255, 255, 255), outline=(200, 200, 200), width=2)
        draw.text((rx + 20, y + 12), title, fill=(40, 40, 40), font=font(FONT_SANS_BOLD, 22))
        draw.text((rx + 320, y + 12), val, fill=(160, 40, 40), font=font(FONT_SANS_BOLD, 22))
        draw.text((rx + 20, y + 44), note, fill=(90, 90, 90), font=small_f)
        y += 92

    draw.text((40, H - 40), "Источник: ИД-2017, пп. 28, 35, 38, 53 (реквизиты), 56 (приказ)", fill=(100, 100, 100), font=small_f)
    out = IMG_DIR / "02_shema_poley.png"
    img.save(out, "PNG")
    return out


def build_requisites_scheme_png():
    W, H = 1200, 1600
    img = Image.new("RGB", (W, H), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    title_f = font(FONT_SANS_BOLD, 30)
    item_f = font(FONT_SANS, 22)
    small_f = font(FONT_SANS, 18)
    draw.text((40, 30), "Порядок расположения реквизитов приказа", fill=(20, 20, 20), font=title_f)
    draw.text((40, 70), "(продольный бланк, форма № 1 приложения № 1 к ИД-2017)", fill=(90, 90, 90), font=small_f)

    blocks = [
        ("1", "Государственный герб РФ", "верхнее поле, по центру, 10 мм от края"),
        ("2", "Наименование органа / воинской части", "центрировано, продольное расположение"),
        ("3", "ПРИКАЗ", "наименование вида документа, прописными"),
        ("4", "Дата ……………………………… № ____", "дата слева, номер справа; словесно-цифровая дата"),
        ("5", "Место издания (г. …)", "центрировано"),
        ("6", "Заголовок к тексту", "по центру; «О …»; без точки в конце"),
        ("7", "Констатирующая часть", "цели/основания; абзацный отступ 1,25 см"),
        ("8", "ПРИКАЗЫВАЮ:", "прописными, по центру"),
        ("9", "Распорядительная часть", "пункты 1., 2., 3. …; исполнители и сроки"),
        ("10", "Подписи", "командир + начальник штаба (при наличии)"),
        ("11", "Визы (оборот 1 экз.)", "нижняя часть оборотной стороны последнего листа"),
        ("12", "Отметка об исполнителе", "оборот последнего листа, внизу слева"),
    ]

    y = 120
    for num, title, note in blocks:
        draw.rounded_rectangle((40, y, W - 40, y + 95), radius=12, fill=(248, 248, 248), outline=(210, 210, 210), width=2)
        draw.ellipse((60, y + 22, 110, y + 72), fill=(180, 50, 50))
        nb = draw.textbbox((0, 0), num, font=font(FONT_SANS_BOLD, 22))
        draw.text((85 - (nb[2] - nb[0]) // 2, y + 34), num, fill=(255, 255, 255), font=font(FONT_SANS_BOLD, 22))
        draw.text((140, y + 20), title, fill=(20, 20, 20), font=font(FONT_SANS_BOLD, 24))
        draw.text((140, y + 54), note, fill=(90, 90, 90), font=item_f)
        # connector
        if num != "12":
            draw.line((85, y + 95, 85, y + 110), fill=(180, 50, 50), width=3)
        y += 115

    out = IMG_DIR / "03_shema_rekvizitov.png"
    img.save(out, "PNG")
    return out


def build_checklist_png():
    W, H = 1200, 1400
    img = Image.new("RGB", (W, H), (252, 252, 250))
    draw = ImageDraw.Draw(img)
    draw.text((40, 30), "Чек-лист оформления приказа", fill=(20, 20, 20), font=font(FONT_SANS_BOLD, 34))
    draw.text((40, 78), "по ИД-2017 (приказ МО РФ № 170)", fill=(100, 100, 100), font=font(FONT_SANS, 22))

    checks = [
        "Формат А4, поля: Л≥30 / П≥10 / В≥20 / Н≥20 мм",
        "Шрифт Times New Roman № 14–16",
        "Межстрочный интервал 1–2; абзацный отступ 1,25 см",
        "На бланке: герб (если гербовый) → орган → ПРИКАЗ",
        "Дата словесно-цифровая слева, номер справа",
        "Место издания указано",
        "Заголовок по центру, без точки, отвечает на «О чём?»",
        "Есть констатирующая часть (или обоснованно отсутствует)",
        "Есть слово ПРИКАЗЫВАЮ",
        "Пункты пронумерованы; указаны исполнители и сроки",
        "Есть пункт о контроле исполнения",
        "Подписи: командир и начальник штаба (если предусмотрен)",
        "Подпись не вынесена на отдельный лист без текста",
        "Приложение оформлено отметкой в правом верхнем углу",
        "Визы — на обороте последнего листа 1-го экземпляра",
        "Отметка об исполнителе — оборот, внизу слева",
    ]
    y = 130
    for i, text in enumerate(checks, 1):
        draw.rounded_rectangle((40, y, W - 40, y + 62), radius=10, fill=(255, 255, 255), outline=(220, 220, 220), width=2)
        draw.rectangle((60, y + 16, 96, y + 52), outline=(40, 40, 40), width=2)
        draw.text((120, y + 16), f"{i}. {text}", fill=(30, 30, 30), font=font(FONT_SANS, 22))
        y += 72

    out = IMG_DIR / "04_chek_list.png"
    img.save(out, "PNG")
    return out


def build_appendix_preview_png():
    W, H = 1240, 1000
    img = Image.new("RGB", (W, H), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    f14 = font(FONT_REG, 26)
    f14b = font(FONT_BOLD, 26)
    f12 = font(FONT_REG, 22)
    small = font(FONT_SANS, 18)

    draw.text((40, 24), "Оформление приложения к приказу (ИД-2017)", fill=(30, 30, 30), font=font(FONT_SANS_BOLD, 28))

    # right-aligned block ~10 cm
    block = [
        "Приложение",
        "к приказу командира",
        "войсковой части 00000",
        "от 5 августа 2026 г. № 120",
    ]
    # find longest
    widths = [draw.textbbox((0, 0), t, font=f12)[2] for t in block]
    max_w = max(widths)
    right = W - 80
    left = right - max_w
    y = 100
    for t in block:
        tw = draw.textbbox((0, 0), t, font=f12)[2]
        draw.text((left + (max_w - tw) // 2, y), t, fill=(0, 0, 0), font=f12)
        y += 30
    draw.rectangle((left - 8, 92, right + 8, y + 4), outline=(200, 80, 80), width=2)
    draw.text((left - 8, y + 12), "блок ≤ 10 см, строки центрированы, у правого поля", fill=(180, 60, 60), font=small)

    y = 320
    for line in ("ПОРЯДОК", "оформления служебных документов", "в войсковой части 00000"):
        bb = draw.textbbox((0, 0), line, font=f14b)
        draw.text(((W - (bb[2] - bb[0])) // 2, y), line, fill=(0, 0, 0), font=f14b)
        y += 34

    y += 30
    text = (
        "1. Служебные документы оформляются на бланках установленной формы либо на листах формата А4. "
        "Каждый лист должен иметь поля: левое — не менее 30 мм, правое — не менее 10 мм, "
        "верхнее и нижнее — не менее 20 мм."
    )
    # simple wrap
    words = text.split()
    line = ""
    x0 = 80
    indent = 50
    first = True
    for w in words:
        test = (line + " " + w).strip()
        limit = W - 80 - (indent if first and not line else 0)
        if draw.textbbox((0, 0), test, font=f14)[2] > (W - 160 if not (first and not line) else W - 160 - indent):
            draw.text((x0 + (indent if first else 0), y), line, fill=(0, 0, 0), font=f14)
            y += 34
            line = w
            first = False
        else:
            line = test
    if line:
        draw.text((x0 + (indent if first else 0), y), line, fill=(0, 0, 0), font=f14)

    y += 80
    draw.line((80, y, 200, y), fill=(0, 0, 0), width=2)
    draw.text((80, y + 16), "черта 2–3 см после текста приложения к проекту", fill=(100, 100, 100), font=small)

    out = IMG_DIR / "05_prilozhenie.png"
    img.save(out, "PNG")
    return out


def main():
    files = [
        build_sample_order_docx(),
        build_memo_docx(),
        build_order_preview_png(),
        build_margins_scheme_png(),
        build_requisites_scheme_png(),
        build_checklist_png(),
        build_appendix_preview_png(),
    ]
    for f in files:
        print("OK:", f)


if __name__ == "__main__":
    main()
