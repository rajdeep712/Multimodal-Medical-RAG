"""Render the README overview: python docs/readme/render_architecture.py (Pillow)."""

from math import cos, pi, sin
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


WIDTH, HEIGHT = 960, 402
MINT, BLUE, GOLD = "#78f3cf", "#9dccff", "#f7cb83"
INK, PAPER, MUTED = "#101e31", "#edf5ff", "#adc1da"


def font(size, heavy=False):
    candidates = (
        Path("C:/Windows/Fonts") / ("seguisb.ttf" if heavy else "segoeui.ttf"),
        Path("/usr/share/fonts/truetype/dejavu") / ("DejaVuSans-Bold.ttf" if heavy else "DejaVuSans.ttf"),
    )
    for candidate in candidates:
        if candidate.is_file():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default(size=size)


def label(draw, position, text, size, fill=PAPER, heavy=False):
    draw.text(position, text, font=font(size, heavy), fill=fill, anchor="lt")


def line(draw, points, fill, width=2):
    draw.line(points, fill=fill, width=width, joint="curve")


def paper(draw, x, y, color):
    draw.rounded_rectangle((x, y, x + 77, y + 96), 8, fill=color)
    for index, length in enumerate((36, 51, 43)):
        draw.rounded_rectangle((x + 13, y + 57 + 8 * index, x + 13 + length, y + 59 + 8 * index), 1, fill="#59718a")


def documents(draw, x, y, phase):
    paper(draw, x - 55, y - 51, "#376678")
    paper(draw, x - 24, y - 41, "#244b60")
    paper(draw, x - 40, y - 45, "#e1f7f4")
    line(draw, [(x - 29, y - 15), (x - 20, y - 15), (x - 15, y - 25), (x - 8, y - 7),
                 (x, y - 22), (x + 7, y - 15), (x + 22, y - 15)], "#1d776f", 3)
    scan = y - 38 + int((1 - cos(phase)) * 39)
    line(draw, [(x - 47, scan), (x + 44, scan)], MINT, 2)
    for index in range(3):
        offset = int(3 * sin(phase + index * 1.7))
        px, py = x + 53 + offset, y - 23 + 24 * index
        draw.rounded_rectangle((px, py, px + 11, py + 11), 3, fill=MINT if index == 1 else "#427b81")


def answer(draw, x, y, phase):
    draw.rounded_rectangle((x - 67, y - 47, x + 20, y - 15), 9, fill="#28517a")
    draw.rounded_rectangle((x - 50, y - 35, x + 3, y - 31), 2, fill=BLUE)
    draw.rounded_rectangle((x - 40, y - 5, x + 69, y + 47), 10, fill="#dbeaff")
    for index, length in enumerate((76, 67, 46)):
        py = y + 8 + 9 * index
        draw.rounded_rectangle((x - 29, py, x - 29 + length, py + 3), 2, fill="#496991")
    offset = int(3 * sin(phase))
    draw.rounded_rectangle((x + 38, y + 28 + offset, x + 66, y + 47 + offset), 5, fill=BLUE)
    label(draw, (x + 44, y + 31 + offset), "E1", 12, INK, True)


def shield(draw, x, y, phase):
    paper(draw, x - 45, y - 48, "#e4e7f1")
    offset = int(3 * sin(phase))
    x, y = x + 21, y + 3 + offset
    points = [(x - 33, y - 29), (x, y - 40), (x + 33, y - 29), (x + 29, y + 6),
              (x + 19, y + 23), (x, y + 37), (x - 19, y + 23), (x - 29, y + 6)]
    draw.polygon(points, fill="#624b36")
    line(draw, points + [points[0]], GOLD, 2)
    line(draw, [(x - 13, y), (x - 3, y + 10), (x + 15, y - 11)], GOLD, 5)


PANELS = (
    ("01 / INGESTION", "Read the report", "Index text, tables, and images", MINT, documents),
    ("02 / INFERENCE", "Ask a question", "Get answers with page citations", BLUE, answer),
    ("03 / DECRYPTION", "Open the source", "Verify and decrypt the original", GOLD, shield),
)


def backdrop():
    image = Image.new("RGB", (WIDTH, HEIGHT))
    draw = ImageDraw.Draw(image)
    for y in range(HEIGHT):
        level = y / HEIGHT
        draw.line(((0, y), (WIDTH, y)), fill=(10 + int(7 * level), 22 + int(10 * level), 37 + int(14 * level)))
    for x in range(29, WIDTH, 19):
        for y in range(17, HEIGHT, 19):
            draw.point((x, y), fill="#29425a")
    return image


def frame(background, number):
    image = background.copy()
    draw = ImageDraw.Draw(image)
    label(draw, (38, 26), "MEDILENS AI   /   SYSTEM OVERVIEW", 13, MINT, True)
    label(draw, (38, 48), "From medical document to cited answer", 36, PAPER, True)
    for index, (eyebrow, title, subtitle, color, illustration) in enumerate(PANELS):
        x = 38 + 300 * index
        active = index == number // 12
        draw.rounded_rectangle((x, 113, x + 284, 345), 15, fill=INK, outline=color if active else "#334b66", width=2)
        label(draw, (x + 18, 129), eyebrow, 12, color, True)
        for radius in (46, 69, 89):
            draw.ellipse((x + 142 - radius, 208 - radius // 2, x + 142 + radius, 208 + radius // 2), outline="#253e55")
        phase = 2 * pi * (number % 12) / 12 if active else 0
        illustration(draw, x + 142, 208, phase)
        label(draw, (x + 18, 276), title, 23, PAPER, True)
        label(draw, (x + 18, 311), subtitle, 15, MUTED)
    label(draw, (38, 367), "MULTIMODAL RETRIEVAL   /   SECURE DOCUMENT STORAGE", 12, MUTED, True)
    for index, (_, _, _, color, _) in enumerate(PANELS):
        x = 859 + index * 23
        draw.rounded_rectangle((x, 371, x + 15, 374), 2, fill=color if index == number // 12 else "#42596e")
    return image.quantize(colors=128, dither=Image.Dither.NONE)


def main():
    background = backdrop()
    frames = [frame(background, number) for number in range(36)]
    frames[0].save(
        Path(__file__).with_name("architecture.gif"), save_all=True,
        append_images=frames[1:], loop=0, duration=120, optimize=True,
    )


if __name__ == "__main__":
    main()
