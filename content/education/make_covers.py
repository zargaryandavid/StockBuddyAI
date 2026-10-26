"""Draws a simple cover picture for each Education article: a diagonal gradient with
a large, soft shape that hints at the topic. The tile draws the title on top."""

import json
import math
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).parent
SIZE = 1000


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def gradient(start: str, end: str) -> Image.Image:
    a, b = hex_rgb(start), hex_rgb(end)
    image = Image.new("RGB", (SIZE, SIZE))
    pixels = image.load()
    for y in range(SIZE):
        for x in range(SIZE):
            t = (x + y) / (2 * SIZE)
            pixels[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return image


def shape(draw: ImageDraw.ImageDraw, kind: str) -> None:
    ink = (255, 255, 255, 70)
    line = (255, 255, 255, 95)
    c = SIZE // 2
    top = 260  # keep shapes in the upper part; the title sits at the bottom
    if kind == "flag":
        draw.line([(380, top), (380, 720)], fill=line, width=24)
        draw.polygon([(392, top), (650, top + 80), (392, top + 170)], fill=ink)
    elif kind == "list":
        for i in range(4):
            y = top + i * 110
            draw.ellipse([300, y, 350, y + 50], fill=ink)
            draw.rounded_rectangle([380, y + 8, 720, y + 42], 17, fill=ink)
    elif kind == "steps":
        for i in range(4):
            draw.rectangle([250 + i * 130, 640 - i * 110, 370 + i * 130, 680], fill=ink)
    elif kind == "coins":
        for i in range(5):
            draw.ellipse([340, 600 - i * 70, 660, 680 - i * 70], fill=ink, outline=line, width=6)
    elif kind == "shield":
        draw.polygon([(c, top), (700, top + 80), (680, 520), (c, 700), (320, 520), (300, top + 80)], fill=ink)
    elif kind == "scissors":
        draw.ellipse([300, 520, 440, 660], outline=line, width=22)
        draw.ellipse([560, 520, 700, 660], outline=line, width=22)
        draw.line([(410, 540), (640, top)], fill=line, width=24)
        draw.line([(590, 540), (360, top)], fill=line, width=24)
    elif kind == "mountain":
        draw.polygon([(220, 700), (460, top + 40), (620, 520), (700, 420), (800, 700)], fill=ink)
        draw.polygon([(460, top + 40), (400, 380), (470, 360), (520, 400)], fill=(255, 255, 255, 120))
    elif kind == "gauge":
        draw.arc([270, top, 730, top + 460], 180, 360, fill=line, width=40)
        angle = math.radians(-40)
        draw.line([(c, top + 230), (c + 190 * math.cos(angle), top + 230 + 190 * math.sin(angle))], fill=line, width=22)
        draw.ellipse([c - 30, top + 200, c + 30, top + 260], fill=line)
    elif kind == "gift":
        draw.rectangle([300, 400, 700, 690], fill=ink)
        draw.rectangle([270, 340, 730, 410], fill=ink)
        draw.rectangle([475, 340, 525, 690], fill=(255, 255, 255, 120))
        draw.ellipse([390, top, 490, 350], outline=line, width=18)
        draw.ellipse([510, top, 610, 350], outline=line, width=18)
    elif kind == "split":
        draw.rounded_rectangle([250, top, 470, 660], 30, fill=ink)
        draw.rounded_rectangle([530, top + 90, 750, 660], 30, fill=ink)
    elif kind == "grid":
        for row in range(5):
            for col in range(5):
                x, y = 290 + col * 90, top - 20 + row * 90
                draw.rounded_rectangle([x, y, x + 64, y + 64], 12, fill=ink)
    elif kind == "flow":
        for i, x in enumerate((300, 500, 700)):
            draw.ellipse([x - 70, 380 - 70, x + 70, 380 + 70], fill=ink)
            if i < 2:
                draw.line([(x + 80, 380), (x + 120, 380)], fill=line, width=18)
        draw.line([(500, 460), (500, 600)], fill=line, width=18)
        draw.ellipse([430, 600, 570, 740], fill=ink)
    elif kind == "spark":
        for i in range(8):
            angle = math.radians(i * 45)
            draw.line([(c, 470), (c + 230 * math.cos(angle), 470 + 230 * math.sin(angle))], fill=line, width=22)
        draw.ellipse([c - 70, 400, c + 70, 540], fill=(255, 255, 255, 120))


def slug(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60]


def main() -> None:
    articles = json.loads((HERE / "financial-freedom-basics.json").read_text())
    out = HERE / "covers"
    out.mkdir(exist_ok=True)
    for article in articles:
        cover = article["cover"]
        base = gradient(cover["from"], cover["to"]).convert("RGBA")
        layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
        shape(ImageDraw.Draw(layer), cover["shape"])
        layer = layer.filter(ImageFilter.GaussianBlur(2))
        image = Image.alpha_composite(base, layer).convert("RGB").resize((800, 800), Image.LANCZOS)
        image.save(out / f"{slug(article['title'])}.jpg", quality=86)
        print("saved", slug(article["title"]))


if __name__ == "__main__":
    main()
