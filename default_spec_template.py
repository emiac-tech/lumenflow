"""Canonical editable default template for OS1 luminaire specification sheets."""

from __future__ import annotations

from typing import Any


DEFAULT_TEMPLATE_KEY = "os1_default_luminaire_specification_v1"
DEFAULT_TEMPLATE_NAME = "Luminaire Specification Sheet"
DEFAULT_TEMPLATE_VERSION = 2
PAGE_WIDTH = 595
PAGE_HEIGHT = 842

TEAL = "#0C5871"
DARK = "#17202A"
GRID = "#9AA4AD"
LIGHT = "#F4F6F7"
RED = "#E53935"
WHITE = "#FFFFFF"
MUTED = "#66737E"


def _style(
    *,
    font_size: float = 7,
    color: str = DARK,
    background: str = "transparent",
    border_color: str = "transparent",
    border_width: float = 0,
    bold: bool = False,
    padding: float = 3,
    text_align: str = "left",
    vertical_align: str = "middle",
) -> dict[str, Any]:
    return {
        "fontSize": font_size,
        "color": color,
        "backgroundColor": background,
        "borderColor": border_color,
        "borderWidth": border_width,
        "fontWeight": "bold" if bold else "normal",
        "padding": padding,
        "textAlign": text_align,
        "verticalAlign": vertical_align,
    }


def build_default_specification_template_design() -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    counter = 0

    def add(
        item_type: str,
        x: float,
        y: float,
        width: float,
        height: float,
        *,
        text: str = "",
        binding: str = "",
        style: dict[str, Any] | None = None,
        empty_text: str = "Not available",
    ) -> None:
        nonlocal counter
        counter += 1
        items.append(
            {
                "id": f"default-{counter:03d}",
                "type": item_type,
                "bindingKey": binding,
                "imageUrl": "",
                "label": text,
                "text": text,
                "x": x,
                "y": y,
                "width": width,
                "height": height,
                "emptyText": empty_text,
                "style": style or _style(),
            }
        )

    def shape(x: float, y: float, width: float, height: float, *, fill: str = WHITE, border: str = GRID, border_width: float = 0.6) -> None:
        add(
            "shape",
            x,
            y,
            width,
            height,
            style=_style(background=fill, border_color=border, border_width=border_width, padding=0),
        )

    def text(
        value: str,
        x: float,
        y: float,
        width: float,
        height: float,
        *,
        size: float = 7,
        color: str = DARK,
        bold: bool = False,
        align: str = "left",
        valign: str = "middle",
        padding: float = 3,
    ) -> None:
        add(
            "text",
            x,
            y,
            width,
            height,
            text=value,
            style=_style(font_size=size, color=color, bold=bold, padding=padding, text_align=align, vertical_align=valign),
        )

    def field(
        binding: str,
        x: float,
        y: float,
        width: float,
        height: float,
        *,
        size: float = 7,
        color: str = DARK,
        bold: bool = False,
        align: str = "left",
        valign: str = "middle",
        padding: float = 3,
        empty_text: str = "Not available",
    ) -> None:
        add(
            "field",
            x,
            y,
            width,
            height,
            binding=binding,
            style=_style(font_size=size, color=color, bold=bold, padding=padding, text_align=align, vertical_align=valign),
            empty_text=empty_text,
        )

    def image(binding: str, x: float, y: float, width: float, height: float) -> None:
        add(
            "image",
            x,
            y,
            width,
            height,
            binding=binding,
            style=_style(background="transparent", padding=5),
        )

    def bar(title: str, x: float, y: float, width: float, height: float = 18) -> None:
        shape(x, y, width, height, fill=TEAL, border=TEAL, border_width=0)
        text(title, x + 3, y, width - 6, height, size=7.4, color=WHITE, bold=True, padding=0)

    def pair_row(
        y: float,
        left_label: str,
        left_binding: str,
        right_label: str,
        right_binding: str,
        *,
        height: float = 24,
        left_empty: str = "Not available",
        right_empty: str = "Not available",
    ) -> None:
        widths = (82, 108, 72, 118)
        cursor = 24
        for width in widths:
            shape(cursor, y, width, height, fill=LIGHT if cursor in (24, 214) else WHITE)
            cursor += width
        text(left_label, 27, y, 76, height, bold=True, size=6.4)
        field(left_binding, 106, y, 102, height, size=6.8, empty_text=left_empty)
        text(right_label, 217, y, 66, height, bold=True, size=6.4)
        field(right_binding, 286, y, 112, height, size=6.8, empty_text=right_empty)

    # Header — project, dynamic logo, title and luminaire reference.
    shape(24, 25, 150, 96)
    shape(174, 25, 65, 96)
    shape(239, 25, 250, 96)
    shape(489, 25, 82, 96)
    shape(24, 25, 150, 15, fill=TEAL, border=TEAL, border_width=0)
    shape(489, 25, 82, 15, fill=TEAL, border=TEAL, border_width=0)
    text("Project Name", 24, 25, 150, 15, size=7, color=WHITE, bold=True, align="center", padding=0)
    field("projectName", 28, 41, 142, 34, size=13, color=RED, bold=True, align="center", padding=2)
    shape(24, 76, 42, 22, fill=LIGHT)
    shape(66, 76, 108, 22)
    text("Location", 27, 76, 36, 22, size=5.8, bold=True)
    field("projectLocationCountry", 69, 76, 102, 22, size=6.2)
    shape(24, 98, 42, 23, fill=LIGHT)
    shape(66, 98, 108, 23)
    text("Issue Date", 27, 98, 36, 23, size=5.8, bold=True)
    field("projectIssueDate", 69, 98, 102, 23, size=6.2)
    image("projectLogoUrl", 179, 32, 55, 82)
    text("LUMINAIRE SPECIFICATION SHEET", 244, 25, 240, 96, size=14, bold=True, align="center", padding=3)
    text("Luminaire Ref.", 489, 25, 82, 15, size=7, color=WHITE, bold=True, align="center", padding=0)
    field("luminaireReference", 493, 41, 74, 76, size=12.5, color=RED, bold=True, align="center", padding=2)

    # General / product.
    bar("1. GENERAL + PRODUCT", 24, 121, 380)
    bar("PRODUCT IMAGE", 404, 121, 167)
    pair_row(139, "Luminaire Reference", "luminaireReference", "Quantity", "quantity")
    pair_row(163, "Location", "luminaireLocation", "Product Code / Ref.", "productCode")
    pair_row(187, "Description", "description", "Mounting Type", "mountingType")
    pair_row(211, "Manufacturer", "manufacturer", "Product Name", "productName")
    shape(404, 139, 167, 210)
    text("Product image not available", 409, 139, 157, 210, size=7, color=MUTED, align="center")
    image("productImageUrl", 409, 144, 157, 200)

    # Light performance.
    bar("2. LIGHT PERFORMANCE", 24, 235, 380)
    pair_row(253, "Light Source", "lightSource", "Wattage", "wattage")
    pair_row(277, "Colour Temperature", "colourTemperature", "CRI", "cri")
    pair_row(301, "MacAdam / SDCM", "macadam", "Beam / Distribution", "beamDistribution")
    pair_row(325, "Delivered Lumens", "deliveredLumens", "LED Lifetime", "ledLifetime")

    # Electrical / controls + physical data.
    bar("3. ELECTRICAL / CONTROLS + PHYSICAL DATA", 24, 349, 380)
    bar("DIMENSION DRAWING", 404, 349, 167)
    pair_row(367, "Input Voltage", "inputVoltage", "Emergency Provision", "emergencyProvision")
    pair_row(392, "Dimensions (LxWxH / ØxH)", "dimensions", "Dimming / Control", "dimming")
    pair_row(417, "Material", "material", "Finish / Colour", "finishColour")
    pair_row(442, "IP Rating", "ipRating", "IK Rating", "ikRating")
    pair_row(467, "Weight", "weight", "Operating Temp.", "operatingTemperature")
    shape(404, 367, 167, 125)
    text("Dimension drawing not available", 409, 367, 157, 125, size=7, color=MUTED, align="center")
    image("diagramImageUrl", 409, 372, 157, 115)

    # Accessories and notes.
    bar("4. ACCESSORIES / INSTALLATION", 24, 492, 547)
    shape(24, 510, 130, 36, fill=LIGHT)
    shape(154, 510, 417, 36)
    text("Required Accessories", 27, 510, 124, 36, size=6.5, bold=True)
    field("requiredAccessories", 157, 510, 411, 36, size=7)

    bar("5. NOTES", 24, 546, 547)
    shape(24, 564, 130, 72, fill=LIGHT)
    shape(154, 564, 417, 72)
    text("General Notes", 27, 564, 124, 72, size=6.5, bold=True, valign="top", padding=4)
    field("generalNotes", 157, 564, 411, 72, size=7, valign="top", padding=4)

    # Footer.
    shape(24, 784, 547, 1, fill=TEAL, border=TEAL, border_width=0)
    field("projectName", 24, 790, 260, 18, size=6.5, color=MUTED, empty_text="")
    text("Generated by RISE OS for Lighting Workflows", 311, 790, 260, 18, size=6.5, color=MUTED, align="right")

    return {
        "items": items,
        "systemTemplateKey": DEFAULT_TEMPLATE_KEY,
        "systemTemplateVersion": DEFAULT_TEMPLATE_VERSION,
        "description": "Editable default luminaire specification sheet based on the supplied spreadsheet.",
    }


COMPACT_TEMPLATE_KEY = "os1_compact_luminaire_specification_v1"
COMPACT_TEMPLATE_NAME = "RISE Compact"
COMPACT_TEMPLATE_VERSION = 1


def build_compact_specification_template_design() -> dict[str, Any]:
    """One-page compact sheet: slim header, a single key-spec table on the
    left and product image + dimension drawing stacked on the right.
    Uses the same TEAL accent so project accents are applied at render time."""
    items: list[dict[str, Any]] = []
    counter = 0

    def add(item_type: str, x: float, y: float, width: float, height: float, *, text: str = "",
            binding: str = "", style: dict[str, Any] | None = None, empty_text: str = "—") -> None:
        nonlocal counter
        counter += 1
        items.append({
            "id": f"compact-{counter:03d}", "type": item_type, "bindingKey": binding, "imageUrl": "",
            "label": text, "text": text, "x": x, "y": y, "width": width, "height": height,
            "emptyText": empty_text, "style": style or _style(),
        })

    def shape(x, y, w, h, *, fill=WHITE, border=GRID, bw=0.5):
        add("shape", x, y, w, h, style=_style(background=fill, border_color=border, border_width=bw, padding=0))

    def text(value, x, y, w, h, *, size=7, color=DARK, bold=False, align="left", valign="middle", padding=3):
        add("text", x, y, w, h, text=value, style=_style(font_size=size, color=color, bold=bold, padding=padding, text_align=align, vertical_align=valign))

    def field(binding, x, y, w, h, *, size=7, color=DARK, bold=False, align="left", valign="middle", padding=3, empty="—"):
        add("field", x, y, w, h, binding=binding, empty_text=empty,
            style=_style(font_size=size, color=color, bold=bold, padding=padding, text_align=align, vertical_align=valign))

    def image(binding, x, y, w, h):
        add("image", x, y, w, h, binding=binding, style=_style(background="transparent", padding=4))

    # Accent strip + header.
    shape(24, 24, 547, 4, fill=TEAL, border=TEAL, bw=0)
    shape(24, 28, 547, 62)
    image("projectLogoUrl", 28, 32, 70, 54)
    text("LUMINAIRE SPECIFICATION SHEET", 104, 30, 300, 18, size=11, bold=True)
    field("projectName", 104, 48, 300, 16, size=9, color=RED, bold=True)
    field("projectLocationCountry", 104, 64, 150, 14, size=6.5, color=MUTED, empty="")
    field("projectIssueDate", 254, 64, 150, 14, size=6.5, color=MUTED, empty="")
    shape(489, 28, 82, 62, fill=LIGHT)
    text("LUMINAIRE REF.", 489, 30, 82, 14, size=6, color=MUTED, bold=True, align="center", padding=0)
    field("luminaireReference", 489, 44, 82, 42, size=9.5, color=TEAL, bold=True, align="center", padding=2)

    # Key specification table (left).
    rows = [
        ("Manufacturer", "manufacturer"), ("Product", "productName"), ("Product code", "productCode"),
        ("Mounting", "mountingType"), ("Quantity", "quantity"), ("Light source", "lightSource"),
        ("Wattage", "wattage"), ("CCT", "colourTemperature"), ("CRI", "cri"),
        ("Beam", "beamDistribution"), ("Lumens", "deliveredLumens"), ("Lifetime", "ledLifetime"),
        ("Voltage", "inputVoltage"), ("Dimming", "dimming"), ("IP / IK", "ipRating"),
        ("Dimensions", "dimensions"), ("Material", "material"), ("Finish", "finishColour"),
        ("Weight", "weight"),
    ]
    top = 100
    shape(24, top, 330, 16, fill=TEAL, border=TEAL, bw=0)
    text("KEY SPECIFICATION", 28, top, 320, 16, size=7, color=WHITE, bold=True, padding=0)
    y = top + 16
    for index, (label, binding) in enumerate(rows):
        shape(24, y, 330, 19, fill=LIGHT if index % 2 == 0 else WHITE)
        text(label, 28, y, 90, 19, size=6.4, bold=True)
        field(binding, 120, y, 232, 19, size=6.8)
        y += 19

    # Description.
    shape(24, y + 6, 330, 16, fill=TEAL, border=TEAL, bw=0)
    text("DESCRIPTION", 28, y + 6, 320, 16, size=7, color=WHITE, bold=True, padding=0)
    shape(24, y + 22, 330, 60)
    field("description", 28, y + 22, 322, 60, size=6.8, valign="top", padding=4)

    # Images (right).
    shape(364, top, 207, 16, fill=TEAL, border=TEAL, bw=0)
    text("PRODUCT", 368, top, 200, 16, size=7, color=WHITE, bold=True, padding=0)
    shape(364, top + 16, 207, 190)
    text("Product image not available", 368, top + 16, 199, 190, size=7, color=MUTED, align="center")
    image("productImageUrl", 368, top + 20, 199, 182)
    shape(364, top + 214, 207, 16, fill=TEAL, border=TEAL, bw=0)
    text("DIMENSIONS", 368, top + 214, 200, 16, size=7, color=WHITE, bold=True, padding=0)
    shape(364, top + 230, 207, 160)
    text("Dimension drawing not available", 368, top + 230, 199, 160, size=7, color=MUTED, align="center")
    image("diagramImageUrl", 368, top + 234, 199, 152)

    # Notes.
    notes_y = max(y + 92, top + 400)
    shape(24, notes_y, 547, 16, fill=TEAL, border=TEAL, bw=0)
    text("ACCESSORIES / NOTES", 28, notes_y, 540, 16, size=7, color=WHITE, bold=True, padding=0)
    shape(24, notes_y + 16, 547, 50)
    field("requiredAccessories", 28, notes_y + 16, 539, 24, size=6.8, empty="")
    field("generalNotes", 28, notes_y + 40, 539, 26, size=6.8, valign="top", empty="")

    # Footer.
    shape(24, 784, 547, 1, fill=TEAL, border=TEAL, bw=0)
    field("projectName", 24, 790, 260, 18, size=6.5, color=MUTED, empty="")
    field("studioName", 311, 790, 260, 18, size=6.5, color=MUTED, align="right", empty="Generated by RISE OS")

    return {
        "items": items,
        "systemTemplateKey": COMPACT_TEMPLATE_KEY,
        "systemTemplateVersion": COMPACT_TEMPLATE_VERSION,
        "description": "Compact one-page luminaire specification sheet.",
    }
