#!/usr/bin/env python3
"""Build BoardYume's local raster art pack.

If incoming/atlas-spec.json exists, its regions are extracted first. The file shape is:
{"atlases":[{"source":"incoming/art.png","sprites":[
  {"key":"custom.name","name":"name","category":"items","box":[0,0,64,64],"size":[96,96]}
]}]}

Missing canonical art is then filled with deterministic, original Pillow-rendered art.
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets"
INCOMING = ROOT / "incoming"
SCALE = 3
RESAMPLE = Image.Resampling.LANCZOS
RNG = random.Random(82419)
MANIFEST: dict[str, dict] = {}

CATEGORIES = ("background", "tiles", "crops", "buildings", "items", "characters", "effects", "ui", "nature")


def sc(v: float) -> int:
    return int(round(v * SCALE))


def pts(values):
    return [(sc(x), sc(y)) for x, y in values]


def image(size, color=(0, 0, 0, 0)):
    return Image.new("RGBA", (sc(size[0]), sc(size[1])), color)


def finish(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    return im.resize(size, RESAMPLE)


def color_shift(hex_color: str, amount: int) -> str:
    value = hex_color.lstrip("#")
    rgb = [int(value[i:i + 2], 16) for i in (0, 2, 4)]
    rgb = [max(0, min(255, n + amount)) for n in rgb]
    return "#" + "".join(f"{n:02x}" for n in rgb)


def save_asset(key: str, category: str, name: str, im: Image.Image, *, fmt="webp", frames=1,
               frame_size=None, duration=None, tags=None):
    folder = OUT / category
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{name}.{fmt}"
    temporary = path.with_suffix(path.suffix + ".tmp")
    if getattr(im, "n_frames", 1) > 1:
        im.save(temporary, format="WEBP", save_all=True, quality=92, method=6, lossless=True)
    elif fmt == "png":
        im.save(temporary, format="PNG", optimize=True)
    else:
        im.save(temporary, format="WEBP", quality=94, method=6, lossless=True)
    temporary.replace(path)
    entry = {
        "src": "/assets/" + path.relative_to(OUT).as_posix(),
        "width": im.width,
        "height": im.height,
        "format": fmt,
        "frames": frames,
    }
    if frame_size:
        entry["frameWidth"], entry["frameHeight"] = frame_size
    if duration:
        entry["durationMs"] = duration
    if tags:
        entry["tags"] = tags
    MANIFEST[key] = entry


def save_animated(key: str, category: str, name: str, frames: list[Image.Image], duration=130, tags=None):
    folder = OUT / category
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{name}.webp"
    temporary = path.with_suffix(path.suffix + ".tmp")
    frames[0].save(temporary, "WEBP", save_all=True, append_images=frames[1:], duration=duration,
                   loop=0, lossless=True, quality=94, method=6, disposal=2)
    temporary.replace(path)
    MANIFEST[key] = {
        "src": "/assets/" + path.relative_to(OUT).as_posix(),
        "width": frames[0].width,
        "height": frames[0].height,
        "format": "webp",
        "frames": len(frames),
        "durationMs": duration,
        "animated": True,
        "tags": tags or [],
    }


def ellipse_shadow(draw, box, opacity=75):
    draw.ellipse(tuple(sc(v) for v in box), fill=(55, 39, 34, opacity))


def grain(draw, polygon, count, palette, seed):
    local = random.Random(seed)
    xs = [p[0] for p in polygon]
    ys = [p[1] for p in polygon]
    for _ in range(count):
        x = local.randint(min(xs), max(xs))
        y = local.randint(min(ys), max(ys))
        # Point-in-diamond approximation, suitable for the tile silhouettes below.
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        rx, ry = (max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2
        if abs((x - cx) / rx) + abs((y - cy) / ry) <= .94:
            r = local.choice((1, 1, 2, 2, 3)) * SCALE
            draw.ellipse((x-r, y-r//2, x+r, y+r//2), fill=local.choice(palette))


def build_tile(name, base, speckles, seed, detail=None):
    size = (192, 112)
    im = image(size)
    d = ImageDraw.Draw(im)
    diamond = pts([(96, 3), (189, 54), (96, 109), (3, 57)])
    d.polygon(pts([(3, 57), (96, 109), (96, 102), (3, 51)]), fill=color_shift(base, -38))
    d.polygon(pts([(96, 109), (189, 54), (189, 47), (96, 102)]), fill=color_shift(base, -24))
    d.polygon(diamond, fill=base)
    grain(d, diamond, 88, speckles, seed)
    if detail:
        detail(d, seed)
    return finish(im, size)


def generate_tiles():
    def grass_detail(d, seed):
        local = random.Random(seed)
        for _ in range(18):
            x, y = local.randint(22, 170), local.randint(25, 88)
            if abs((x-96)/93) + abs((y-56)/52) < .82:
                d.line(pts([(x, y), (x-2, y-5)]), fill="#5b8b45", width=sc(1))
                d.line(pts([(x, y), (x+3, y-6)]), fill="#8dbf63", width=sc(1))

    def tilled_detail(d, seed):
        for off in (-24, -12, 0, 12, 24):
            d.line(pts([(31+off, 62-off*.12), (89+off, 93-off*.12), (155+off, 55-off*.12)]),
                   fill="#6d412d", width=sc(3))
            d.line(pts([(33+off, 59-off*.12), (91+off, 89-off*.12), (153+off, 52-off*.12)]),
                   fill="#b97a50", width=sc(1))

    def wet_detail(d, seed):
        tilled_detail(d, seed)
        d.ellipse(tuple(sc(v) for v in (73, 43, 111, 58)), fill=(88, 114, 105, 85))
        d.arc(tuple(sc(v) for v in (78, 45, 108, 55)), 190, 335, fill="#c5d9c2", width=sc(1))

    def stone_detail(d, seed):
        local = random.Random(seed)
        for _ in range(15):
            x, y = local.randint(32, 155), local.randint(31, 80)
            w, h = local.randint(10, 20), local.randint(5, 9)
            d.polygon(pts([(x-w, y), (x, y-h), (x+w, y), (x, y+h)]), fill=local.choice(("#9c9a87", "#b2aa91", "#7d806f")))
            d.line(pts([(x-w, y), (x, y-h), (x+w, y)]), fill="#d5c9aa", width=sc(1))

    def water_detail(d, seed):
        for x, y, w in ((47, 47, 32), (105, 66, 38), (78, 79, 22), (120, 39, 25)):
            d.arc(tuple(sc(v) for v in (x, y, x+w, y+8)), 190, 345, fill="#b9ece1", width=sc(2))

    specs = [
        ("grass_01", "#72aa4e", ("#8cc865", "#4f8b42", "#a6d26e"), grass_detail),
        ("grass_02", "#79ad54", ("#99c96e", "#477d3d", "#d5d28a"), grass_detail),
        ("grass_03", "#699d4b", ("#87b960", "#3e753b", "#a9c767"), grass_detail),
        ("soil_bare", "#9d633f", ("#c08151", "#75452f", "#aa6d47"), None),
        ("soil_tilled", "#8d5438", ("#ad6a45", "#623a2c"), tilled_detail),
        ("soil_wet", "#62453b", ("#786057", "#45342f"), wet_detail),
        ("path_dirt", "#bd8b59", ("#d2a269", "#916741", "#76583d"), None),
        ("path_stone", "#8b8b79", ("#ada68e", "#747866"), stone_detail),
        ("water", "#4fa8a7", ("#61bab5", "#317f8a"), water_detail),
        ("shore", "#c1a767", ("#dccb83", "#8f8657", "#659766"), water_detail),
    ]
    for i, (name, base, accents, detail) in enumerate(specs):
        save_asset(f"tile.{name}", "tiles", name, build_tile(name, base, accents, 100+i, detail), tags=["tile", "isometric"])


def leaf(draw, x, y, r, color, tilt=0):
    draw.ellipse(tuple(sc(v) for v in (x-r, y-r*.55, x+r, y+r*.55)), fill=color)
    dx = math.cos(tilt) * r
    dy = math.sin(tilt) * r * .5
    draw.line(pts([(x-dx, y-dy), (x+dx, y+dy)]), fill=color_shift(color, -28), width=sc(1))


def crop_art(kind: str, stage: int, sway=0, watered=False):
    size = (128, 160)
    im = image(size)
    d = ImageDraw.Draw(im)
    ellipse_shadow(d, (33, 133, 96, 148), 52)
    d.ellipse(tuple(sc(v) for v in (44, 129, 86, 143)), fill="#795039")
    if stage == 0:
        d.arc(tuple(sc(v) for v in (50, 130, 79, 140)), 185, 355, fill="#b77c4b", width=sc(2))
        for x in (57, 64, 71):
            d.ellipse(tuple(sc(v) for v in (x-2, 132, x+2, 135)), fill="#d1b16d")
    else:
        growth = (0, .28, .5, .76, 1)[stage]
        base_y = 132
        green = {
            "wheat":"#78a84f", "corn":"#4d9b50", "sunflower":"#4f954b",
            "eggplant":"#4f874d", "blueberry":"#477f51"
        }.get(kind, "#5b9b4c")
        cx = 64 + sway
        if kind in ("wheat", "corn", "sunflower"):
            count = 2 if stage < 2 else (5 if kind == "wheat" else 3)
            height = (28 + 72 * growth) * (1.1 if kind in ("corn", "sunflower") else 1)
            for i in range(count):
                ox = (i-(count-1)/2) * (8 if kind == "wheat" else 11)
                top = base_y-height+abs(ox)*.18
                d.line(pts([(cx+ox, base_y), (cx+ox+sway*.25, top)]), fill=green, width=sc(4 if kind != "wheat" else 2))
                if growth > .35:
                    leaf(d, cx+ox-5, base_y-height*.45, 10 if kind == "corn" else 6, color_shift(green, 12), -.5)
                    leaf(d, cx+ox+6, base_y-height*.65, 11 if kind == "corn" else 6, color_shift(green, 4), .5)
                if stage >= 3 and kind == "wheat":
                    for k in range(4):
                        y = top+k*4
                        leaf(d, cx+ox-3, y, 4, "#d9b94e", -.45)
                        leaf(d, cx+ox+3, y+2, 4, "#e5c65a", .45)
                if stage == 4 and kind == "corn":
                    d.rounded_rectangle(tuple(sc(v) for v in (cx+ox-7, base_y-height*.63, cx+ox+5, base_y-height*.35)), radius=sc(4), fill="#efc94e")
                    d.line(pts([(cx+ox-4, base_y-height*.62), (cx+ox+2, base_y-height*.36)]), fill="#a58129", width=sc(1))
            if kind == "sunflower" and stage >= 3:
                y = base_y-height
                for a in range(0, 360, 30):
                    px = cx+math.cos(math.radians(a))*16
                    py = y+math.sin(math.radians(a))*10
                    d.ellipse(tuple(sc(v) for v in (px-7, py-4, px+7, py+4)), fill="#f4c843")
                d.ellipse(tuple(sc(v) for v in (cx-10, y-8, cx+10, y+8)), fill="#76502d")
                d.ellipse(tuple(sc(v) for v in (cx-6, y-5, cx+6, y+4)), fill="#9f6b31")
        elif kind in ("pumpkin", "watermelon"):
            spread = 18 + 30*growth
            d.arc(tuple(sc(v) for v in (cx-spread, 104, cx+spread, 139)), 190, 345, fill=green, width=sc(3))
            for ox, oy in ((-23, 116), (15, 111), (32, 126), (-4, 130))[:1+stage]:
                leaf(d, cx+ox, oy, 9+3*growth, color_shift(green, int(ox/4)), .3)
            if stage == 4:
                fruit = "#e67f32" if kind == "pumpkin" else "#3e8b50"
                for ox, oy, r in ((-25, 125, 13), (20, 121, 15)):
                    d.ellipse(tuple(sc(v) for v in (cx+ox-r, oy-r*.65, cx+ox+r, oy+r*.65)), fill=fruit)
                    if kind == "pumpkin":
                        d.arc(tuple(sc(v) for v in (cx+ox-r*.55, oy-r*.6, cx+ox+r*.55, oy+r*.6)), 80, 280, fill="#bd5928", width=sc(2))
                    else:
                        d.arc(tuple(sc(v) for v in (cx+ox-r*.72, oy-r*.55, cx+ox+r*.72, oy+r*.55)), 110, 255, fill="#7bb95c", width=sc(2))
        elif kind == "cabbage":
            rings = max(2, stage+2)
            for ring in range(rings, 0, -1):
                rr = (10 + ring*4) * growth
                for a in range(0, 360, 50):
                    x = cx + math.cos(math.radians(a))*rr*.45
                    y = 128 + math.sin(math.radians(a))*rr*.23
                    leaf(d, x, y, rr*.48, color_shift("#69ac55", ring*5), math.radians(a))
        elif kind == "lavender":
            stems = max(2, stage + 2)
            for i in range(stems):
                ox = (i - (stems - 1) / 2) * 9
                height = (22 + 51 * growth) - abs(ox) * .25
                top = base_y - height
                d.line(pts([(cx + ox * .5, base_y), (cx + ox + sway * .2, top)]), fill="#4f8247", width=sc(2))
                if stage >= 2:
                    for bead in range(5):
                        yy = top + bead * 5
                        rr = 3 + growth
                        d.ellipse(tuple(sc(v) for v in (cx+ox-rr, yy-rr*.65, cx+ox+rr, yy+rr*.65)), fill=color_shift("#8468a9", bead*4))
        else:
            bush_h = 22 + 40*growth
            stems = max(2, stage+2)
            for i in range(stems):
                ox = (i-(stems-1)/2)*10
                top = base_y-bush_h+abs(ox)*.18
                d.line(pts([(cx+ox*.4, base_y), (cx+ox, top)]), fill="#4f793c", width=sc(3))
                leaf(d, cx+ox-7, top+12, 11*growth+3, color_shift(green, i*4), -.45)
                leaf(d, cx+ox+7, top+22, 10*growth+3, color_shift(green, 12-i*3), .45)
            if stage == 4:
                fruits = {
                    "carrot": ("#e97831", "root"), "tomato": ("#d94a35", "round"),
                    "strawberry": ("#d94047", "berry"), "potato": ("#b99059", "root"),
                    "blueberry": ("#5369a5", "berry"), "pepper": ("#d9573f", "round")
                }
                col, shape = fruits.get(kind, ("#dd6543", "round"))
                for ox, oy in ((-20, 106), (2, 116), (22, 101), (-7, 91)):
                    x, y = cx+ox, oy
                    if shape == "long":
                        d.ellipse(tuple(sc(v) for v in (x-5, y-4, x+6, y+16)), fill=col)
                    elif shape == "root":
                        d.ellipse(tuple(sc(v) for v in (x-6, y-4, x+7, y+9)), fill=col)
                    else:
                        d.ellipse(tuple(sc(v) for v in (x-6, y-5, x+7, y+7)), fill=col)
                    d.polygon(pts([(x-4, y-4), (x, y-9), (x+4, y-4)]), fill="#4a813f")
    if watered:
        for i, (x, y) in enumerate(((42, 82), (83, 70), (99, 101), (54, 56))):
            yy = y + sway*2 + i
            d.ellipse(tuple(sc(v) for v in (x-2, yy-5, x+2, yy+3)), fill="#7ad4df")
            d.ellipse(tuple(sc(v) for v in (x-1, yy-4, x, yy-1)), fill="#d8fbf6")
    return finish(im, size)


CROPS = [
    ("carrot", "Carrot", "#eb7a32"), ("wheat", "Wheat", "#dfbd50"),
    ("tomato", "Tomato", "#d94a38"), ("pumpkin", "Pumpkin", "#e57b31"),
    ("strawberry", "Strawberry", "#d94350"), ("corn", "Corn", "#f0c84d"),
    ("potato", "Potato", "#b88a54"), ("cabbage", "Cabbage", "#72af55"),
    ("blueberry", "Blueberry", "#5266a4"), ("eggplant", "Eggplant", "#6d4793"),
    ("sunflower", "Sunflower", "#f2c442"), ("watermelon", "Watermelon", "#438b51"),
]


def product_icon(kind, color, seed=False):
    im = image((96, 96))
    d = ImageDraw.Draw(im)
    ellipse_shadow(d, (19, 69, 78, 84), 52)
    if seed:
        d.polygon(pts([(28, 28), (70, 22), (78, 65), (38, 75), (22, 51)]), fill="#d6b978")
        d.polygon(pts([(28, 28), (70, 22), (64, 33), (34, 38)]), fill="#f0da9c")
        d.line(pts([(34, 39), (38, 69)]), fill="#a57b45", width=sc(2))
        for x, y in ((46, 45), (57, 53), (48, 60)):
            d.ellipse(tuple(sc(v) for v in (x-2, y-3, x+3, y+3)), fill=color)
    else:
        if kind in ("wheat", "corn", "sunflower"):
            for i in range(5):
                x = 42+i*5
                d.line(pts([(34+i*3, 71), (x, 28+i*2)]), fill="#77934b", width=sc(2))
                d.ellipse(tuple(sc(v) for v in (x-4, 27+i*2, x+5, 39+i*2)), fill=color)
        elif kind in ("pumpkin", "watermelon", "cabbage"):
            d.ellipse(tuple(sc(v) for v in (25, 32, 74, 71)), fill=color)
            d.arc(tuple(sc(v) for v in (35, 33, 65, 70)), 80, 280, fill=color_shift(color, -35), width=sc(3))
            d.polygon(pts([(44, 33), (49, 23), (55, 34)]), fill="#4d843e")
        elif kind == "lavender":
            for i in range(7):
                x = 30 + i * 6
                d.line(pts([(48, 74), (x, 25+i%2*4)]), fill="#56824c", width=sc(2))
                for bead in range(5):
                    y = 25+i%2*4+bead*5
                    d.ellipse(tuple(sc(v) for v in (x-4, y-3, x+4, y+3)), fill=color_shift(color, bead*4))
            d.rectangle(tuple(sc(v) for v in (31, 62, 64, 68)), fill="#b68a4c")
        elif kind == "pepper":
            for x, y, col in ((37, 48, color), (57, 43, "#e4ae3e"), (50, 64, "#cf4438")):
                d.rounded_rectangle(tuple(sc(v) for v in (x-11, y-11, x+11, y+12)), radius=sc(8), fill=col)
                d.polygon(pts([(x-5, y-10), (x, y-16), (x+5, y-10)]), fill="#4d873d")
        elif kind == "carrot":
            d.polygon(pts([(34, 34), (67, 37), (49, 76)]), fill=color)
            for a in (-12, 0, 12):
                leaf(d, 49+a*.3, 29, 13, "#559545", math.radians(a))
        else:
            for x, y, r in ((38, 52, 14), (57, 48, 16), (51, 64, 13)):
                d.ellipse(tuple(sc(v) for v in (x-r, y-r*.72, x+r, y+r*.72)), fill=color)
                d.polygon(pts([(x-6, y-r*.55), (x, y-r*.9), (x+7, y-r*.55)]), fill="#4c873d")
    return finish(im, (96, 96))


def generate_crops():
    stages = ("sown", "sprout", "young", "mature", "harvest")
    crop_catalog = {}
    for kind, label, color in CROPS:
        save_asset(f"crop.{kind}.seed", "crops", f"{kind}_seed", product_icon(kind, color, True), tags=["seed", kind])
        save_asset(f"crop.{kind}.product", "crops", f"{kind}_product", product_icon(kind, color, False), tags=["product", kind])
        stage_paths = []
        for i, stage in enumerate(stages):
            key = f"crop.{kind}.{stage}"
            save_asset(key, "crops", f"{kind}_{stage}", crop_art(kind, i), tags=["crop", kind, stage])
            stage_paths.append(MANIFEST[key]["src"])
        wind = [crop_art(kind, 4, sway=s) for s in (0, -2, 1, 3, 0, -1)]
        watered = [crop_art(kind, 4, sway=s, watered=True) for s in (0, -2, 1, 2, 0)]
        save_animated(f"crop.{kind}.wind", "crops", f"{kind}_wind", wind, 145, ["crop", "animation", "wind"])
        save_animated(f"crop.{kind}.watered", "crops", f"{kind}_watered", watered, 115, ["crop", "animation", "water"])
        crop_catalog[kind] = {
            "label": label,
            "seed": MANIFEST[f"crop.{kind}.seed"]["src"],
            "product": MANIFEST[f"crop.{kind}.product"]["src"],
            "stages": stage_paths,
            "wind": MANIFEST[f"crop.{kind}.wind"]["src"],
            "watered": MANIFEST[f"crop.{kind}.watered"]["src"],
        }
    return crop_catalog


def nature_tree(style, variant, fruit=None):
    im = image((220, 260))
    d = ImageDraw.Draw(im)
    ellipse_shadow(d, (35, 211, 187, 241), 68)
    trunk = {"oak":"#815637", "pine":"#75503a", "maple":"#795039", "fruit":"#805437"}[style]
    d.polygon(pts([(96, 211), (108, 100), (129, 103), (142, 213)]), fill=trunk)
    d.polygon(pts([(108, 205), (118, 107), (126, 110), (127, 207)]), fill=color_shift(trunk, 25))
    d.polygon(pts([(112, 126), (73, 88), (80, 82), (122, 110)]), fill=trunk)
    d.polygon(pts([(122, 143), (157, 102), (164, 108), (132, 156)]), fill=color_shift(trunk, -8))
    local = random.Random(variant*41 + len(style)*13 + (len(fruit) if fruit else 0))
    if style == "pine":
        colors = ("#2f6e4a", "#3f8252", "#5a9660")
        for y, w in ((45, 38), (73, 55), (104, 69), (137, 82), (164, 76)):
            cx = 116 + local.randint(-4, 4)
            d.polygon(pts([(cx, y-31), (cx-w, y+32), (cx+w, y+32)]), fill=local.choice(colors))
            d.line(pts([(cx, y-26), (cx, y+26)]), fill="#80aa69", width=sc(2))
    else:
        colors = ("#3f8445", "#58a04e", "#72ad55") if style != "maple" else ("#a8513b", "#cf7540", "#de9b48")
        blobs = [(112, 58, 45), (73, 86, 42), (151, 92, 45), (109, 106, 52), (65, 132, 35), (158, 140, 37)]
        for x, y, r in blobs:
            x += local.randint(-8, 8); y += local.randint(-5, 5); r += local.randint(-4, 5)
            d.ellipse(tuple(sc(v) for v in (x-r, y-r*.7, x+r, y+r*.7)), fill=local.choice(colors))
            d.arc(tuple(sc(v) for v in (x-r*.65, y-r*.5, x+r*.45, y+r*.35)), 210, 345, fill=(210, 239, 147, 115), width=sc(2))
        if fruit:
            fcolor = {"apple":"#d94d3d", "orange":"#e98a33", "lemon":"#e7c53a"}[fruit]
            for x, y in ((73, 88), (122, 66), (151, 111), (102, 125), (58, 132), (158, 143)):
                d.ellipse(tuple(sc(v) for v in (x-6, y-5, x+6, y+6)), fill=fcolor)
                d.ellipse(tuple(sc(v) for v in (x-3, y-3, x, y)), fill="#fff0b0")
    return finish(im, (220, 260))


def nature_small(kind, variant):
    im = image((128, 128))
    d = ImageDraw.Draw(im)
    local = random.Random(903 + variant*17 + len(kind))
    ellipse_shadow(d, (22, 93, 108, 113), 60)
    if kind == "rock":
        base = local.choice(("#77817a", "#8b8b79", "#77766e"))
        d.polygon(pts([(25, 90), (37, 58), (63, 35), (94, 46), (108, 83), (91, 101), (45, 101)]), fill=base)
        d.polygon(pts([(37, 58), (63, 35), (72, 63), (50, 78)]), fill=color_shift(base, 33))
        d.polygon(pts([(72, 63), (94, 46), (108, 83), (91, 101)]), fill=color_shift(base, -20))
        for _ in range(7):
            x, y = local.randint(40, 91), local.randint(54, 85)
            d.ellipse(tuple(sc(v) for v in (x-2, y-1, x+2, y+1)), fill="#b2af95")
    elif kind == "bush":
        colors = ("#3e7e42", "#579748", "#6caa50")
        for x, y, r in ((39, 79, 25), (64, 61, 31), (91, 78, 26), (66, 88, 31)):
            d.ellipse(tuple(sc(v) for v in (x-r, y-r*.6, x+r, y+r*.65)), fill=local.choice(colors))
            d.arc(tuple(sc(v) for v in (x-r*.6, y-r*.4, x+r*.4, y+r*.3)), 210, 330, fill="#a0ca69", width=sc(2))
    elif kind == "grass":
        for i in range(16):
            x = 26+i*5+local.randint(-3,3); top=local.randint(48,82)
            col = local.choice(("#4f8c42", "#71a54c", "#88b858"))
            d.polygon(pts([(x-3, 100), (x, top), (x+4, 100)]), fill=col)
    elif kind == "stump":
        d.polygon(pts([(38, 53), (88, 52), (95, 96), (32, 96)]), fill="#795039")
        d.ellipse(tuple(sc(v) for v in (36, 42, 91, 66)), fill="#b67b48")
        d.ellipse(tuple(sc(v) for v in (46, 48, 82, 61)), outline="#805332", width=sc(2))
        d.arc(tuple(sc(v) for v in (54, 50, 76, 59)), 0, 300, fill="#d09a5d", width=sc(1))
        d.polygon(pts([(38, 88), (24, 105), (48, 96)]), fill="#68432f")
        d.polygon(pts([(86, 88), (107, 102), (77, 96)]), fill="#68432f")
    elif kind == "flower":
        petals = ("#f1c95b", "#e9898c", "#8e82c1", "#f2eee0", "#6db8c8")
        for j in range(5):
            x = 32+j*15+local.randint(-4,4); y=local.randint(54,88)
            d.line(pts([(x, 101), (x, y)]), fill="#4c8a43", width=sc(2))
            col = petals[(variant+j)%len(petals)]
            for a in range(0, 360, 90):
                px=x+math.cos(math.radians(a))*6; py=y+math.sin(math.radians(a))*5
                d.ellipse(tuple(sc(v) for v in (px-5, py-4, px+5, py+4)), fill=col)
            d.ellipse(tuple(sc(v) for v in (x-3, y-3, x+3, y+3)), fill="#7e5b35")
    return finish(im, (128, 128))


def fence_piece(kind):
    im = image((192, 144)); d = ImageDraw.Draw(im)
    ellipse_shadow(d, (16, 103, 179, 127), 50)
    wood="#9a673e"; light="#c38b52"; dark="#70452f"
    if kind == "gate":
        for x in (38, 153):
            d.polygon(pts([(x-8, 104), (x-6, 33), (x+7, 27), (x+9, 108)]), fill=wood)
            d.polygon(pts([(x-6, 33), (x+7, 27), (x+3, 42), (x-6, 46)]), fill=light)
        d.polygon(pts([(52, 55), (137, 43), (138, 96), (54, 107)]), fill=wood)
        d.line(pts([(55, 102), (136, 47)]), fill=light, width=sc(6))
        d.ellipse(tuple(sc(v) for v in (124, 67, 132, 75)), fill="#e0bd63")
    else:
        for x in (29, 92, 158):
            d.polygon(pts([(x-6, 109), (x-5, 39), (x+6, 31), (x+7, 111)]), fill=wood)
            d.line(pts([(x-3, 43), (x+3, 40)]), fill=light, width=sc(2))
        d.polygon(pts([(18, 62), (171, 42), (173, 57), (20, 78)]), fill=light)
        d.polygon(pts([(21, 91), (171, 70), (171, 85), (22, 106)]), fill=wood)
        d.line(pts([(21, 78), (173, 57)]), fill=dark, width=sc(2))
    return finish(im, (192, 144))


def generate_nature():
    for style in ("oak", "pine", "maple"):
        for variant in range(1, 4):
            save_asset(f"nature.tree.{style}.{variant}", "nature", f"tree_{style}_{variant}", nature_tree(style, variant), tags=["tree", style, "gatherable"])
    for fruit in ("apple", "orange", "lemon"):
        save_asset(f"nature.tree.fruit.{fruit}", "nature", f"fruit_tree_{fruit}", nature_tree("fruit", 1, fruit), tags=["tree", "fruit", fruit])
    for kind, count in (("rock", 3), ("bush", 3), ("grass", 3), ("stump", 3), ("flower", 6)):
        for variant in range(1, count+1):
            save_asset(f"nature.{kind}.{variant}", "nature", f"{kind}_{variant}", nature_small(kind, variant), tags=["nature", kind])
    save_asset("nature.fence", "nature", "fence", fence_piece("fence"), tags=["fence", "buildable"])
    save_asset("nature.gate", "nature", "gate", fence_piece("gate"), tags=["gate", "buildable"])


BUILDINGS = [
    ("house_1", "cottage", "#d8884d", "#8b4b3d"), ("house_2", "cottage", "#dba05e", "#6c5b72"),
    ("house_3", "cottage", "#e2b66f", "#4e7075"), ("storage", "barn", "#bb6a4e", "#6f4439"),
    ("sawmill", "workshop", "#a97148", "#6e5444"), ("stoneworks", "workshop", "#979486", "#646b67"),
    ("well", "well", "#8e8d7e", "#78543c"), ("windmill", "windmill", "#d5c493", "#96704e"),
    ("greenhouse", "greenhouse", "#7aa98a", "#cfddd0"), ("coop", "barn", "#c88752", "#8f4d3d"),
    ("kitchen", "workshop", "#c88655", "#79483e"), ("market", "market", "#d39b52", "#b84f42"),
    ("bridge", "bridge", "#9b6a43", "#704730"), ("lantern", "lantern", "#61544a", "#e6bd61"),
    ("bench", "bench", "#97633f", "#655044"), ("signpost", "sign", "#9d7047", "#765137"),
    ("smelter", "smelter", "#807a70", "#554d49"), ("fence", "fence", "#9b693f", "#70462f"),
    ("gate", "gate", "#9b693f", "#70462f"), ("flower_arch", "flower_arch", "#71804b", "#9d7047"),
]


def building_art(name, kind, wall, roof, active=0, construction=False):
    size = (320, 280)
    im=image(size); d=ImageDraw.Draw(im)
    ellipse_shadow(d, (42, 213, 280, 256), 62)
    if construction:
        d.polygon(pts([(55, 217), (158, 161), (275, 211), (169, 264)]), fill="#b88c59")
        for x,y in ((77,197),(153,155),(249,198),(168,247)):
            d.rectangle(tuple(sc(v) for v in (x-5,y-61,x+5,y+7)), fill="#806044")
            d.rectangle(tuple(sc(v) for v in (x-8,y-60,x+8,y-53)), fill="#c3975c")
        d.line(pts([(77,183),(249,184)]), fill="#d1a766", width=sc(7))
        d.line(pts([(86,164),(235,228)]), fill="#d1a766", width=sc(6))
        d.polygon(pts([(135,212),(179,189),(214,205),(168,229)]), fill="#d9b66f")
        return finish(im,size)
    if kind in ("cottage", "barn", "workshop"):
        # Isometric body and roof with deliberately distinct facade details.
        d.polygon(pts([(72,125),(166,78),(263,125),(264,211),(166,260),(72,211)]), fill=wall)
        d.polygon(pts([(166,78),(263,125),(264,211),(166,260)]), fill=color_shift(wall,-24))
        d.polygon(pts([(53,128),(158,64),(280,120),(168,183)]), fill=roof)
        d.polygon(pts([(53,128),(168,183),(168,199),(55,145)]), fill=color_shift(roof,-22))
        d.polygon(pts([(168,183),(280,120),(279,139),(168,199)]), fill=color_shift(roof,-34))
        if kind == "cottage":
            d.polygon(pts([(112,185),(145,168),(145,232),(111,248)]), fill="#654539")
            d.polygon(pts([(204,153),(238,136),(238,170),(204,187)]), fill="#7fc0bd")
            d.line(pts([(221,145),(221,177)]), fill="#e9ddaf", width=sc(2))
            d.line(pts([(204,170),(238,153)]), fill="#e9ddaf", width=sc(2))
            d.polygon(pts([(221,76),(240,87),(240,42),(225,35)]), fill="#765047")
            for n in range(active):
                yy=24-n*11
                d.ellipse(tuple(sc(v) for v in (226+n*5,yy,246+n*7,yy+14)), fill=(220,218,197,135))
        elif kind == "barn":
            d.polygon(pts([(99,182),(164,149),(164,235),(99,267)]), fill="#704435")
            d.line(pts([(102,181),(160,231)]), fill="#bc8257", width=sc(5))
            d.line(pts([(160,151),(103,263)]), fill="#bc8257", width=sc(5))
            d.ellipse(tuple(sc(v) for v in (203,148,235,175)), fill="#efe5b4")
        else:
            d.polygon(pts([(105,195),(153,171),(153,240),(105,263)]), fill="#5d4639")
            d.rectangle(tuple(sc(v) for v in (194,146,237,181)), fill="#473f38")
            d.polygon(pts([(193,146),(239,126),(238,146),(194,166)]), fill="#bc925e")
            if name == "sawmill":
                d.ellipse(tuple(sc(v) for v in (193,139,235,181)), fill="#b5b4a4", outline="#66695f", width=sc(3))
                for a in range(0,360,45):
                    d.line(pts([(214,160),(214+math.cos(math.radians(a+active*12))*19,160+math.sin(math.radians(a+active*12))*19)]),fill="#6d7069",width=sc(2))
            elif name == "stoneworks":
                for x,y in ((198,163),(218,153),(230,169)):
                    d.polygon(pts([(x-7,y+5),(x,y-7),(x+9,y),(x+5,y+9)]),fill="#a6a694")
            else:
                d.polygon(pts([(203,154),(225,143),(231,177),(209,188)]),fill="#d17f42")
    elif kind == "well":
        d.ellipse(tuple(sc(v) for v in (80,142,242,230)), fill="#696d66")
        d.rectangle(tuple(sc(v) for v in (80,174,242,215)), fill="#7b7d70")
        for x in range(88,235,28):
            d.line(pts([(x,170),(x+18,216)]),fill="#a8a590",width=sc(3))
        for x in (105,217): d.rectangle(tuple(sc(v) for v in (x-6,76,x+7,184)),fill="#865a3c")
        d.polygon(pts([(86,91),(161,49),(240,88),(160,128)]),fill=roof)
        d.line(pts([(111,115),(216,84)]),fill="#c08c54",width=sc(4))
        d.line(pts([(162,97),(162,161+active*3)]),fill="#4e463e",width=sc(2))
        d.ellipse(tuple(sc(v) for v in (145,153+active*3,179,171+active*3)),fill="#557a7d")
    elif kind == "windmill":
        d.polygon(pts([(115,233),(130,79),(197,78),(218,233)]),fill=wall)
        d.polygon(pts([(130,79),(164,38),(197,78)]),fill=roof)
        cx,cy=166,105
        d.ellipse(tuple(sc(v) for v in (157,96,175,114)),fill="#665044")
        angle=active*22
        for a in (angle,angle+90,angle+180,angle+270):
            ex=cx+math.cos(math.radians(a))*83; ey=cy+math.sin(math.radians(a))*83
            px=-math.sin(math.radians(a))*8; py=math.cos(math.radians(a))*8
            d.polygon(pts([(cx+px,cy+py),(ex+px,ey+py),(ex-px*.7,ey-py*.7),(cx-px,cy-py)]),fill="#d8c58c")
            d.line(pts([(cx,cy),(ex,ey)]),fill="#806247",width=sc(3))
        d.polygon(pts([(144,175),(177,158),(182,226),(143,245)]),fill="#765040")
    elif kind == "greenhouse":
        d.polygon(pts([(66,142),(156,80),(260,133),(165,196)]),fill=(183,224,205,190))
        d.polygon(pts([(66,142),(165,196),(165,246),(66,195)]),fill=(118,184,159,180))
        d.polygon(pts([(165,196),(260,133),(260,185),(165,246)]),fill=(92,158,143,185))
        for x in range(88,251,32): d.line(pts([(x,131),(x,210)]),fill="#477764",width=sc(3))
        d.line(pts([(66,142),(165,196),(260,133)]),fill="#d8f0da",width=sc(3))
        for x in (109,145,195,226):
            d.ellipse(tuple(sc(v) for v in (x-9,171,x+9,204)),fill="#5a9c4f")
    elif kind == "market":
        d.polygon(pts([(66,151),(171,98),(262,143),(163,197)]),fill=roof)
        for i,x in enumerate(range(77,252,24)):
            d.polygon(pts([(x,145),(x+13,139),(x+13,171),(x,177)]),fill="#f0d398" if i%2 else roof)
        for x in (82,244): d.rectangle(tuple(sc(v) for v in (x-5,152,x+5,232)),fill="#81583d")
        d.polygon(pts([(77,196),(160,237),(247,193),(247,222),(160,264),(77,225)]),fill="#9a623f")
        for x,y,c in ((118,199,"#d75b43"),(147,211,"#edc14b"),(180,203,"#5f9e4c"),(208,189,"#8a5c9f")):
            d.ellipse(tuple(sc(v) for v in (x-10,y-7,x+10,y+7)),fill=c)
    elif kind == "bridge":
        d.polygon(pts([(43,171),(130,115),(284,188),(193,248)]),fill="#6d4934")
        for i in range(9):
            x=62+i*21; y=169+i*9
            d.polygon(pts([(x,y),(x+70,y-42),(x+83,y-35),(x+13,y+9)]),fill=color_shift(wall,(i%3)*9))
        d.arc(tuple(sc(v) for v in (39,127,210,238)),190,339,fill="#d0a36a",width=sc(5))
        d.arc(tuple(sc(v) for v in (141,136,295,244)),195,342,fill="#d0a36a",width=sc(5))
    elif kind == "lantern":
        d.rectangle(tuple(sc(v) for v in (151,83,164,228)),fill=wall)
        d.polygon(pts([(137,79),(159,61),(181,77),(174,125),(144,126)]),fill="#524b45")
        glow=Image.new("RGBA",im.size,(0,0,0,0)); gd=ImageDraw.Draw(glow)
        gd.ellipse(tuple(sc(v) for v in (121-active*2,55-active*2,197+active*2,143+active*2)),fill=(242,193,75,58))
        glow=glow.filter(ImageFilter.GaussianBlur(sc(8))); im.alpha_composite(glow); d=ImageDraw.Draw(im)
        d.polygon(pts([(146,82),(159,69),(172,81),(168,115),(149,115)]),fill="#f0c760")
    elif kind == "bench":
        for x in (93,220): d.rectangle(tuple(sc(v) for v in (x-8,144,x+6,225)),fill=roof)
        d.polygon(pts([(61,129),(247,98),(251,123),(65,156)]),fill=wall)
        d.polygon(pts([(63,164),(235,139),(252,160),(79,189)]),fill=color_shift(wall,12))
        d.rectangle(tuple(sc(v) for v in (76,181,89,231)),fill=roof)
        d.rectangle(tuple(sc(v) for v in (226,158,239,210)),fill=roof)
    elif kind == "sign":
        d.polygon(pts([(149,90),(171,82),(174,231),(151,241)]),fill=wall)
        d.polygon(pts([(70,94),(239,58),(247,102),(78,139)]),fill=color_shift(wall,12))
        d.polygon(pts([(88,111),(111,94),(112,103),(135,89),(132,111),(107,123)]),fill=roof)
    elif kind == "smelter":
        d.polygon(pts([(75,198),(98,112),(219,105),(254,198),(165,250)]),fill="#77766d")
        d.polygon(pts([(98,112),(159,79),(219,105),(165,143)]),fill="#a09b87")
        d.polygon(pts([(131,188),(158,154),(192,173),(190,224),(133,235)]),fill="#4a403b")
        d.ellipse(tuple(sc(v) for v in (139,170,188,222)),fill="#d66d33")
        d.ellipse(tuple(sc(v) for v in (148,181,181,215)),fill="#f2b846")
        d.polygon(pts([(207,110),(228,99),(230,39),(207,50)]),fill="#655e58")
        for n in range(max(1,active)):
            y=25-n*12; d.ellipse(tuple(sc(v) for v in (207+n*4,y,238+n*7,y+19)),fill=(176,169,157,130))
        for x,y in ((87,204),(225,200),(105,223)):
            d.polygon(pts([(x-12,y),(x,y-12),(x+14,y),(x+4,y+12)]),fill="#8d897c")
    elif kind in ("fence", "gate"):
        piece = fence_piece("gate" if kind == "gate" else "fence").resize((sc(224),sc(168)),RESAMPLE)
        im.alpha_composite(piece,(sc(48),sc(84)))
        d=ImageDraw.Draw(im)
    elif kind == "flower_arch":
        for x in (92,224):
            d.polygon(pts([(x-10,235),(x-8,91),(x+9,86),(x+11,235)]),fill=roof)
        d.arc(tuple(sc(v) for v in (91,49,225,159)),180,360,fill=roof,width=sc(14))
        d.arc(tuple(sc(v) for v in (105,64,211,151)),180,360,fill="#4f8348",width=sc(8))
        for i,a in enumerate(range(190,351,20)):
            x=158+math.cos(math.radians(a))*67; y=112+math.sin(math.radians(a))*54
            col=("#e9848d","#f0c256","#a27bb5","#f2e2cf")[i%4]
            for pa in range(0,360,90):
                px=x+math.cos(math.radians(pa))*6; py=y+math.sin(math.radians(pa))*5
                d.ellipse(tuple(sc(v) for v in (px-5,py-4,px+5,py+4)),fill=col)
            d.ellipse(tuple(sc(v) for v in (x-3,y-3,x+3,y+3)),fill="#7e5a33")
    return finish(im,size)


def building_shadow():
    im=image((320,280)); d=ImageDraw.Draw(im); ellipse_shadow(d,(39,210,286,260),72)
    return finish(im,(320,280))


def generate_buildings():
    for name, kind, wall, roof in BUILDINGS:
        save_asset(f"building.{name}", "buildings", name, building_art(name,kind,wall,roof), tags=["building",kind])
        save_asset(f"building.{name}.construction", "buildings", f"{name}_construction", building_art(name,kind,wall,roof,construction=True), tags=["building","construction"])
        save_asset(f"building.{name}.shadow", "buildings", f"{name}_shadow", building_shadow(), tags=["shadow"])
        frames=[building_art(name,kind,wall,roof,active=i) for i in range(6)]
        save_animated(f"building.{name}.active", "buildings", f"{name}_active", frames, 150, ["building","animation",kind])


ITEMS = {
    "wood":("log","#9d673e"), "stone":("rock","#85877d"), "fiber":("fiber","#6c9b4d"),
    "clay":("lump","#b66d4d"), "ore":("ore","#5f7580"), "water":("drop","#55b9c1"),
    "plank":("plank","#bd8754"), "stone_block":("block","#9a9b8d"), "metal_bar":("bar","#7a8d93"),
    "flour":("bag","#e7d6a5"), "jam":("jar","#ad3f55"), "meal":("bowl","#cf8248"),
    "coin":("coin","#e3b843"), "fertilizer":("bag","#7d9851"), "animal_feed":("bag","#c5a453"),
}
TOOLS = {"axe":"#94704f","pickaxe":"#7c8586","hoe":"#a2704c","watering_can":"#579aa2","hammer":"#9c704d","scythe":"#7f8c86"}


def item_icon(kind,color):
    im=image((96,96)); d=ImageDraw.Draw(im); ellipse_shadow(d,(15,72,82,86),48)
    if kind=="log":
        d.rounded_rectangle(tuple(sc(v) for v in (18,39,77,70)),radius=sc(12),fill=color)
        d.ellipse(tuple(sc(v) for v in (62,39,84,70)),fill="#cf955b"); d.ellipse(tuple(sc(v) for v in (68,45,79,64)),outline="#8c5a36",width=sc(2))
    elif kind in ("rock","lump","ore"):
        d.polygon(pts([(20,66),(30,38),(57,24),(79,42),(84,67),(67,78),(35,77)]),fill=color)
        d.polygon(pts([(30,38),(57,24),(62,48),(41,59)]),fill=color_shift(color,32))
        if kind=="ore":
            for x,y in ((43,50),(61,39),(67,61)): d.polygon(pts([(x-5,y),(x,y-6),(x+6,y),(x,y+5)]),fill="#79b8b2")
    elif kind=="fiber":
        for i in range(9):
            x=25+i*6; d.arc(tuple(sc(v) for v in (x,27-i%2*3,x+22,76)),120,250,fill=color_shift(color,i),width=sc(3))
        d.rectangle(tuple(sc(v) for v in (29,59,75,66)),fill="#b98a50")
    elif kind=="drop":
        d.polygon(pts([(49,18),(26,58),(31,73),(49,82),(68,73),(72,58)]),fill=color)
        d.ellipse(tuple(sc(v) for v in (35,49,47,67)),fill="#9be2dc")
    elif kind in ("plank","bar"):
        for i in range(3):
            y=35+i*15; d.polygon(pts([(18,y),(68,y-11),(81,y-3),(31,y+10)]),fill=color_shift(color,i*10))
    elif kind=="block":
        d.polygon(pts([(21,46),(53,27),(81,40),(48,60)]),fill=color_shift(color,20)); d.polygon(pts([(21,46),(48,60),(48,80),(21,65)]),fill=color); d.polygon(pts([(48,60),(81,40),(81,60),(48,80)]),fill=color_shift(color,-20))
    elif kind=="bag":
        d.polygon(pts([(30,29),(66,29),(78,69),(66,80),(29,79),(20,66)]),fill=color)
        d.rectangle(tuple(sc(v) for v in (31,26,65,35)),fill=color_shift(color,-28)); d.line(pts([(29,53),(70,53)]),fill=color_shift(color,20),width=sc(2))
    elif kind=="jar":
        d.rounded_rectangle(tuple(sc(v) for v in (28,31,69,78)),radius=sc(8),fill=color); d.rectangle(tuple(sc(v) for v in (27,24,70,35)),fill="#d8bd83")
        d.ellipse(tuple(sc(v) for v in (38,46,59,66)),fill="#f0d895")
    elif kind=="bowl":
        d.pieslice(tuple(sc(v) for v in (18,35,79,82)),0,180,fill="#d9ad69"); d.ellipse(tuple(sc(v) for v in (18,32,79,54)),fill=color)
        for x,y in ((35,42),(49,38),(61,44)): d.ellipse(tuple(sc(v) for v in (x-6,y-5,x+6,y+5)),fill="#6ea04d")
    elif kind=="coin":
        d.ellipse(tuple(sc(v) for v in (20,20,79,79)),fill=color); d.ellipse(tuple(sc(v) for v in (28,28,71,71)),outline="#f7d86d",width=sc(4)); d.polygon(pts([(50,33),(56,45),(69,47),(59,56),(61,69),(50,62),(38,69),(41,56),(31,47),(44,45)]),fill="#bd8735")
    return finish(im,(96,96))


def tool_icon(name,color):
    im=image((96,96)); d=ImageDraw.Draw(im); ellipse_shadow(d,(17,73,80,85),45)
    if name=="watering_can":
        d.ellipse(tuple(sc(v) for v in (26,37,67,76)),fill=color); d.rectangle(tuple(sc(v) for v in (23,39,61,69)),fill=color)
        d.arc(tuple(sc(v) for v in (52,26,86,66)),240,80,fill="#89c0c0",width=sc(6)); d.polygon(pts([(27,47),(8,40),(8,32),(31,37)]),fill="#72b3b5")
    else:
        d.line(pts([(28,75),(66,23)]),fill="#a97549",width=sc(8))
        if name=="axe": d.polygon(pts([(54,19),(81,22),(72,45),(58,38)]),fill="#87918f")
        elif name=="pickaxe": d.arc(tuple(sc(v) for v in (39,11,88,45)),190,350,fill="#7d8a89",width=sc(7))
        elif name=="hoe": d.line(pts([(58,25),(82,43)]),fill="#7f8984",width=sc(7))
        elif name=="hammer": d.rounded_rectangle(tuple(sc(v) for v in (52,14,85,36)),radius=sc(4),fill="#777f7d")
        elif name=="scythe": d.arc(tuple(sc(v) for v in (45,10,89,59)),270,95,fill="#a7b1aa",width=sc(6))
    return finish(im,(96,96))


def generate_items():
    for name,(kind,color) in ITEMS.items(): save_asset(f"item.{name}","items",name,item_icon(kind,color),tags=["item",name])
    for name,color in TOOLS.items(): save_asset(f"tool.{name}","items",f"tool_{name}",tool_icon(name,color),tags=["tool",name])
    extras = {
        "hardwood": ("log", "#71452f"), "coal": ("ore", "#3e4548"),
        "metal_ingot": ("bar", "#76898f"), "glass": ("block", "#73b8bb"),
        "rope": ("fiber", "#b68a4c"), "berry_jam": ("jar", "#a6365d"),
        "tomato_soup": ("bowl", "#c94f3b"), "vegetable_stew": ("bowl", "#cb8244"),
        "bread": ("bag", "#c69250"), "apple_preserve": ("jar", "#c45242"),
        "lavender_oil": ("drop", "#8068aa"), "apple": ("round", "#d54b3f"),
    }
    for name, (kind, color) in extras.items():
        if kind == "round":
            art = product_icon("tomato", color)
        else:
            art = item_icon(kind, color)
        save_asset(f"item.{name}", "items", name, art, tags=["item", name])


def character_frame(action, direction, frame):
    im=image((96,128)); d=ImageDraw.Draw(im)
    bounce=(0,-2,-3,-1,0,1)[frame%6] if action in ("walk","run") else 0
    cx=48; head_y=40+bounce; body_y=67+bounce
    flip=-1 if direction=="left" else 1
    back=direction=="up"
    ellipse_shadow(d,(24,105,74,119),48)
    # legs are individually posed rather than translating the whole body.
    phase=math.sin(frame/6*math.tau)
    leg_a=phase*7 if action=="walk" else 0
    d.line(pts([(42,90+bounce),(38-leg_a,108)]),fill="#42556d",width=sc(8))
    d.line(pts([(55,90+bounce),(60+leg_a,108)]),fill="#384b64",width=sc(8))
    d.line(pts([(35-leg_a,109),(45-leg_a,109)]),fill="#684c3b",width=sc(5))
    d.line(pts([(57+leg_a,109),(67+leg_a,109)]),fill="#684c3b",width=sc(5))
    d.rounded_rectangle(tuple(sc(v) for v in (32,57+bounce,64,92+bounce)),radius=sc(10),fill="#d78952")
    d.polygon(pts([(37,66+bounce),(48,75+bounce),(59,66+bounce),(57,91+bounce),(38,91+bounce)]),fill="#4c8290")
    # arms/tools vary per action and frame.
    arm_phase=math.sin(frame/6*math.tau)*10
    if action in ("chop","mine","hoe","build"):
        ang=(-45+frame*24) if frame<4 else 42
        handx=cx+math.cos(math.radians(ang))*28*flip; handy=body_y+math.sin(math.radians(ang))*25
        d.line(pts([(cx+12*flip,body_y),(handx,handy)]),fill="#e2aa78",width=sc(7))
        d.line(pts([(handx,handy),(handx+24*flip,handy-24)]),fill="#91613f",width=sc(4))
        d.polygon(pts([(handx+18*flip,handy-28),(handx+31*flip,handy-31),(handx+28*flip,handy-18)]),fill="#7d8988")
    elif action=="water":
        d.line(pts([(cx+11*flip,body_y),(cx+25*flip,body_y+17)]),fill="#e2aa78",width=sc(7))
        d.ellipse(tuple(sc(v) for v in (cx+13*flip-10,body_y+12,cx+13*flip+16,body_y+35)),fill="#5599a2")
        for i in range(3):
            x=cx+37*flip+i*5*flip; y=body_y+25+i*5+frame%3
            d.ellipse(tuple(sc(v) for v in (x-2,y-3,x+2,y+3)),fill="#6fc7cf")
    elif action in ("sow","harvest","pickup"):
        reach=abs(math.sin(frame/6*math.tau))*22
        d.line(pts([(cx+11*flip,body_y),(cx+(15+reach)*flip,body_y+22)]),fill="#e2aa78",width=sc(7))
        if action=="sow":
            for i in range(3): d.ellipse(tuple(sc(v) for v in (cx+(32+i*5)*flip-2,body_y+29+i*3,cx+(32+i*5)*flip+2,body_y+33+i*3)),fill="#d7ba6a")
    else:
        d.line(pts([(36,65+bounce),(31-arm_phase*.2,87+bounce)]),fill="#e2aa78",width=sc(7))
        d.line(pts([(60,65+bounce),(65+arm_phase*.2,87+bounce)]),fill="#e2aa78",width=sc(7))
    # head and hair/hat.
    d.ellipse(tuple(sc(v) for v in (32,22+bounce,66,58+bounce)),fill="#efbb86")
    hair="#68483c"
    if back:
        d.ellipse(tuple(sc(v) for v in (31,20+bounce,67,60+bounce)),fill=hair)
    else:
        d.pieslice(tuple(sc(v) for v in (31,18+bounce,67,55+bounce)),180,360,fill=hair)
        d.polygon(pts([(34,31+bounce),(42,21+bounce),(47,34+bounce),(55,21+bounce),(64,35+bounce),(63,22+bounce),(36,20+bounce)]),fill=hair)
        eye_x=58 if direction=="right" else (38 if direction=="left" else 48)
        if direction in ("left","right"):
            d.ellipse(tuple(sc(v) for v in (eye_x-2,39+bounce,eye_x+2,43+bounce)),fill="#3e3a38")
        else:
            for ex in (41,56): d.ellipse(tuple(sc(v) for v in (ex-2,39+bounce,ex+2,43+bounce)),fill="#3e3a38")
    d.ellipse(tuple(sc(v) for v in (28,16+bounce,69,33+bounce)),fill="#d6a24b")
    d.rectangle(tuple(sc(v) for v in (22,28+bounce,75,34+bounce)),fill="#bd803a")
    return finish(im,(96,128))


def generate_character():
    actions=("idle","walk","chop","mine","hoe","water","sow","harvest","pickup","build")
    directions=("down","up","left","right")
    for action in actions:
        for direction in directions:
            frames=6
            sheet=Image.new("RGBA",(96*frames,128),(0,0,0,0))
            for frame in range(frames): sheet.alpha_composite(character_frame(action,direction,frame),(frame*96,0))
            save_asset(f"character.player.{action}.{direction}","characters",f"player_{action}_{direction}",sheet,fmt="png",frames=frames,frame_size=(96,128),duration=105 if action=="walk" else 130,tags=["character",action,direction,"sprite-sheet"])


def effect_sheet(name, painter: Callable, frames=8, size=(96,96)):
    sheet=Image.new("RGBA",(size[0]*frames,size[1]),(0,0,0,0))
    for f in range(frames):
        im=image(size); d=ImageDraw.Draw(im); painter(d,f,frames,size); sheet.alpha_composite(finish(im,size),(f*size[0],0))
    save_asset(f"effect.{name}","effects",name,sheet,fmt="png",frames=frames,frame_size=size,duration=90,tags=["effect",name,"sprite-sheet"])


def generate_effects():
    def dust(d,f,n,size):
        local=random.Random(20+f); radius=8+f*5
        for i in range(10):
            a=local.random()*math.tau; r=local.uniform(radius*.4,radius); x=48+math.cos(a)*r; y=65+math.sin(a)*r*.4-f*2
            rr=max(2,8-f*.7); d.ellipse(tuple(sc(v) for v in (x-rr,y-rr*.7,x+rr,y+rr*.7)),fill=(194,154,96,max(0,170-f*17)))
    def sparkle(d,f,n,size):
        for i in range(7):
            a=i/n*math.tau+f*.25; r=10+f*4; x=48+math.cos(a)*r; y=50+math.sin(a)*r
            rr=max(1,6-abs(f-3)); col=(255,226,119,max(0,230-f*15))
            d.polygon(pts([(x,y-rr*2),(x+rr,y),(x,y+rr*2),(x-rr,y)]),fill=col)
    def chip(d,f,n,size):
        local=random.Random(32+f)
        for i in range(9):
            a=local.uniform(3.5,5.9); dist=f*5+local.randint(2,9); x=48+math.cos(a)*dist; y=54+math.sin(a)*dist+f*f*.7
            col="#9a673f" if name_ref[0]=="wood" else "#85887d"
            d.polygon(pts([(x-4,y),(x,y-5),(x+5,y+1),(x,y+4)]),fill=col)
    def rain(d,f,n,size):
        local=random.Random(90+f)
        for i in range(14):
            x=local.randint(6,90); y=(local.randint(-30,90)+f*13)%110-8
            d.line(pts([(x,y),(x-6,y+14)]),fill=(142,211,221,190),width=sc(2))
    def firefly(d,f,n,size):
        for i in range(5):
            x=16+i*17+math.sin(f*.8+i)*7; y=45+math.cos(f*.6+i*2)*22
            rr=3+(f+i)%3; d.ellipse(tuple(sc(v) for v in (x-rr*2,y-rr*2,x+rr*2,y+rr*2)),fill=(242,221,103,45)); d.ellipse(tuple(sc(v) for v in (x-2,y-2,x+2,y+2)),fill="#fff2a0")
    def water(d,f,n,size):
        y=18+f*8
        for i,x in enumerate((25,39,54,70)):
            yy=y+i*4; d.ellipse(tuple(sc(v) for v in (x-3,yy-6,x+3,yy+4)),fill=(103,200,210,max(0,230-f*15)))
    def invalid(d,f,n,size):
        col="#74d080" if name_ref[0]=="valid" else "#e26558"
        alpha=150+int(math.sin(f/n*math.tau)*50)
        d.polygon(pts([(48,7),(90,31),(48,57),(6,32)]),fill=(*ImageColor_get(col),alpha))
        if name_ref[0]=="valid": d.line(pts([(32,31),(44,43),(67,20)]),fill="#f1f4d7",width=sc(5))
        else:
            d.line(pts([(33,19),(64,46)]),fill="#f8dfd2",width=sc(5)); d.line(pts([(64,19),(33,46)]),fill="#f8dfd2",width=sc(5))
    effect_sheet("build_dust",dust)
    effect_sheet("construction_complete",sparkle)
    effect_sheet("harvest_burst",sparkle)
    for name in ("wood","rock"):
        name_ref=[name]; effect_sheet(f"hit_{name}",chip)
    effect_sheet("rain",rain)
    effect_sheet("fireflies",firefly)
    effect_sheet("water_splash",water)
    for name in ("valid","invalid"):
        name_ref=[name]; effect_sheet(f"placement_{name}",invalid)
    shadow=image((96,48)); sd=ImageDraw.Draw(shadow); ellipse_shadow(sd,(9,12,87,39),72)
    save_asset("effect.shadow_actor","effects","shadow_actor",finish(shadow,(96,48)),tags=["effect","shadow"])


def ImageColor_get(value):
    value=value.lstrip("#"); return tuple(int(value[i:i+2],16) for i in (0,2,4))


def ui_frame(size, inner="#56483d", outer="#d0a05d", paper=False):
    im=image(size); d=ImageDraw.Draw(im)
    d.rounded_rectangle(tuple(sc(v) for v in (2,4,size[0]-2,size[1]-2)),radius=sc(12),fill="#49392f")
    d.rounded_rectangle(tuple(sc(v) for v in (6,1,size[0]-7,size[1]-8)),radius=sc(10),fill=outer)
    d.rounded_rectangle(tuple(sc(v) for v in (11,7,size[0]-12,size[1]-13)),radius=sc(7),fill="#f1ddb0" if paper else inner)
    d.line(pts([(17,10),(size[0]-19,10)]),fill="#f3ca7c",width=sc(2))
    for x,y in ((12,11),(size[0]-13,11),(12,size[1]-15),(size[0]-13,size[1]-15)):
        d.ellipse(tuple(sc(v) for v in (x-3,y-3,x+3,y+3)),fill="#765139")
    return finish(im,size)


def ui_button(name,color,size=(160,64)):
    im=image(size); d=ImageDraw.Draw(im)
    d.rounded_rectangle(tuple(sc(v) for v in (3,7,size[0]-3,size[1]-2)),radius=sc(12),fill="#3f332d")
    d.rounded_rectangle(tuple(sc(v) for v in (5,2,size[0]-5,size[1]-9)),radius=sc(10),fill=color)
    d.line(pts([(15,8),(size[0]-16,8)]),fill=color_shift(color,36),width=sc(2))
    # Each action has its own readable raster pictogram.
    cx,cy=32,29
    if name=="build":
        d.polygon(pts([(cx-18,cy),(cx,cy-15),(cx+18,cy),(cx+18,cy+17),(cx-18,cy+17)]),fill="#f2d39a"); d.rectangle(tuple(sc(v) for v in (cx-5,cy+4,cx+5,cy+17)),fill="#79513b")
    elif name=="plant":
        d.line(pts([(cx,cy+17),(cx,cy-7)]),fill="#eff0c3",width=sc(3)); leaf(d,cx-8,cy-2,8,"#e5f0a9",-.4); leaf(d,cx+8,cy-9,8,"#f5e6a6",.4)
    elif name=="craft":
        d.line(pts([(cx-15,cy+13),(cx+14,cy-14)]),fill="#f0d5a2",width=sc(6)); d.rounded_rectangle(tuple(sc(v) for v in (cx+6,cy-20,cx+23,cy-5)),radius=sc(3),fill="#e6e0c2")
    elif name=="settings":
        for a in range(0,360,45):
            x=cx+math.cos(math.radians(a))*14; y=cy+math.sin(math.radians(a))*14; d.rectangle(tuple(sc(v) for v in (x-4,y-6,x+4,y+6)),fill="#efe0b5")
        d.ellipse(tuple(sc(v) for v in (cx-13,cy-13,cx+13,cy+13)),fill="#efe0b5"); d.ellipse(tuple(sc(v) for v in (cx-5,cy-5,cx+5,cy+5)),fill=color)
    return finish(im,size)


def generate_ui():
    frames=[("toolbar",(760,92),False),("inventory_panel",(720,520),False),("description_panel",(420,260),True),("resource_bar",(780,74),False),("dialog",(640,360),True),("settings_panel",(520,420),False),("quest_panel",(390,300),True)]
    for name,size,paper in frames: save_asset(f"ui.{name}","ui",name,ui_frame(size,paper=paper),tags=["ui","frame",name])
    save_asset("ui.item_slot","ui","item_slot",ui_frame((92,92),inner="#665749"),tags=["ui","slot"])
    save_asset("ui.item_slot.selected","ui","item_slot_selected",ui_frame((92,92),inner="#7c693e",outer="#f0c85b"),tags=["ui","slot","selected"])
    for name,color in (("build","#a86643"),("plant","#6b9a4d"),("craft","#568b8e"),("settings","#736480")):
        save_asset(f"ui.button.{name}","ui",f"button_{name}",ui_button(name,color),tags=["ui","button",name])
    # Isometric selection diamond and cursor are raster images.
    for name,col in (("tile_cursor","#f4d46b"),("placement_valid","#70d081"),("placement_invalid","#e15e54")):
        im=image((192,112)); d=ImageDraw.Draw(im)
        d.polygon(pts([(96,4),(188,55),(96,108),(4,56)]),fill=(*ImageColor_get(col),42),outline=(*ImageColor_get(col),230),width=sc(4))
        save_asset(f"ui.{name}","ui",name,finish(im,(192,112)),tags=["ui","cursor",name])


def process_incoming():
    spec_path=INCOMING/"atlas-spec.json"
    if not spec_path.exists(): return 0
    data=json.loads(spec_path.read_text(encoding="utf-8")); count=0
    for atlas in data.get("atlases",[]):
        source=ROOT/atlas["source"]
        if not source.is_file(): raise FileNotFoundError(f"Missing atlas: {source}")
        with Image.open(source) as opened:
            sheet=opened.convert("RGBA")
            for sprite in atlas.get("sprites",[]):
                box=tuple(int(v) for v in sprite["box"]); cropped=sheet.crop(box)
                size=tuple(sprite.get("size",cropped.size)); cropped=cropped.resize(size,RESAMPLE)
                save_asset(sprite["key"],sprite["category"],sprite["name"],cropped,fmt=sprite.get("format","webp"),tags=["atlas"])
                count+=1
    return count


def grid_cell(sheet: Image.Image, columns: int, rows: int, column: int, row: int) -> Image.Image:
    """Crop a cell while distributing non-divisible edge pixels without gaps."""
    x0 = round(sheet.width * column / columns)
    x1 = round(sheet.width * (column + 1) / columns)
    y0 = round(sheet.height * row / rows)
    y1 = round(sheet.height * (row + 1) / rows)
    return sheet.crop((x0, y0, x1, y1))


def contain_alpha(sprite: Image.Image, target: tuple[int, int], padding=3) -> Image.Image:
    """Trim transparent gutter and contain art in a stable transparent frame."""
    source = sprite.convert("RGBA")
    bbox = source.getchannel("A").getbbox()
    if bbox:
        source = source.crop(bbox)
    max_w = max(1, target[0] - padding * 2)
    max_h = max(1, target[1] - padding * 2)
    ratio = min(max_w / source.width, max_h / source.height)
    scaled = source.resize((max(1, round(source.width * ratio)), max(1, round(source.height * ratio))), RESAMPLE)
    framed = Image.new("RGBA", target, (0, 0, 0, 0))
    framed.alpha_composite(scaled, ((target[0] - scaled.width) // 2, target[1] - padding - scaled.height))
    return framed


def crop_environment_atlas(path: Path) -> int:
    sheet = Image.open(path).convert("RGBA")
    count = 0

    tile_names = ("grass_01", "grass_02", "grass_03", "soil_bare", "soil_tilled", "soil_wet", "path_dirt", "path_stone", "water")
    for column, name in enumerate(tile_names):
        # Top band is a nine-column strip, 177 px tall in the source layout.
        cell = sheet.crop((round(sheet.width * column / 9), 0, round(sheet.width * (column + 1) / 9), 177))
        art = contain_alpha(cell, (192, 160), 1)
        save_asset(f"tile.{name}", "tiles", name, art, tags=["tile", "isometric", "production-atlas"])
        count += 1

    nature_names = ("tree_oak_1", "tree_oak_2", "tree_maple_1", "fruit_tree_apple", "bush_1", "rock_1", "stump_1")
    for column, name in enumerate(nature_names):
        cell = sheet.crop((round(sheet.width * column / 7), 177, round(sheet.width * (column + 1) / 7), 443))
        art = contain_alpha(cell, (240, 260), 2)
        if name.startswith("tree_oak"):
            key = f"nature.tree.oak.{name[-1]}"
        elif name.startswith("tree_maple"):
            key = "nature.tree.maple.1"
        elif name == "fruit_tree_apple":
            key = "nature.tree.fruit.apple"
        else:
            key = f"nature.{name.rsplit('_', 1)[0]}.{name[-1]}"
        save_asset(key, "nature", name, art, tags=["nature", "production-atlas"])
        count += 1

    row_three = ("house_1", "house_2", "house_3", "storage", "sawmill", "stoneworks", "well", "windmill")
    for column, name in enumerate(row_three):
        cell = sheet.crop((round(sheet.width * column / 8), 443, round(sheet.width * (column + 1) / 8), 665))
        save_asset(f"building.{name}", "buildings", name, contain_alpha(cell, (320, 280), 3), tags=["building", "production-atlas"])
        count += 1

    row_four = ("greenhouse", "coop", "kitchen", "market", "bridge", "lantern", "bench")
    for column, name in enumerate(row_four):
        cell = sheet.crop((round(sheet.width * column / 7), 665, round(sheet.width * (column + 1) / 7), sheet.height))
        save_asset(f"building.{name}", "buildings", name, contain_alpha(cell, (320, 280), 3), tags=["building", "production-atlas"])
        count += 1
    return count


def crop_crops_atlas(path: Path):
    sheet = Image.open(path).convert("RGBA")
    atlas_names = ("carrot", "tomato", "wheat", "corn", "potato", "strawberry", "pumpkin", "cabbage", "sunflower", "eggplant", "blueberry", "watermelon")
    canonical = {name: name for name in atlas_names}
    stage_names = ("seed", "sown", "young", "mature", "harvest", "product")
    crop_catalog = {}
    count = 0
    for row, atlas_name in enumerate(atlas_names):
        crop_name = canonical.get(atlas_name)
        if crop_name is None:
            continue
        paths = {}
        for column, stage in enumerate(stage_names):
            cell = grid_cell(sheet, 6, 12, column, row)
            art = contain_alpha(cell, (144, 128), 2)
            key = f"crop.{crop_name}.{stage}"
            save_asset(key, "crops", f"{crop_name}_{stage}", art, tags=["crop", crop_name, stage, "production-atlas"])
            paths[stage] = MANIFEST[key]["src"]
            count += 1
        # The source offers four biological phases after planting. Keep a distinct
        # germination slot by mapping the painted sown frame, then all later frames.
        paths["sprout"] = paths["sown"]
        crop_catalog[crop_name] = {
            "label": next(label for name, label, _ in CROPS if name == crop_name),
            "seed": paths["seed"],
            "product": paths["product"],
            "stages": [paths["sown"], paths["sprout"], paths["young"], paths["mature"], paths["harvest"]],
            "wind": MANIFEST[f"crop.{crop_name}.wind"]["src"],
            "watered": MANIFEST[f"crop.{crop_name}.watered"]["src"],
        }
    return count, crop_catalog


def crop_player_atlas(path: Path) -> int:
    sheet = Image.open(path).convert("RGBA")
    rows = (
        ("idle", "down"), ("walk", "down"), ("walk", "up"), ("walk", "left"), ("walk", "right"),
        ("chop", "down"), ("mine", "down"), ("hoe", "down"), ("water", "down"),
        ("sow", "down"), ("harvest", "down"), ("pickup", "down"), ("build", "down"),
    )
    for row, (action, direction) in enumerate(rows):
        frame_list = [contain_alpha(grid_cell(sheet, 4, 13, column, row), (96, 128), 1) for column in range(4)]
        strip = Image.new("RGBA", (96 * 4, 128), (0, 0, 0, 0))
        for column, frame in enumerate(frame_list):
            strip.alpha_composite(frame, (column * 96, 0))
        save_asset(f"character.player.{action}.{direction}", "characters", f"player_{action}_{direction}", strip,
                   fmt="png", frames=4, frame_size=(96, 128), duration=115,
                   tags=["character", action, direction, "sprite-sheet", "production-atlas"])
    return len(rows) * 4


def crop_ui_items_atlas(path: Path) -> int:
    sheet = Image.open(path).convert("RGBA")
    count = 0
    icon_rows = (
        (("item.glove", "glove"), ("tool.axe", "tool_axe"), ("tool.pickaxe", "tool_pickaxe"), ("tool.hoe", "tool_hoe"), ("tool.watering_can", "tool_watering_can"), ("tool.hammer", "tool_hammer")),
        tuple((f"item.{name}", name) for name in ("wood", "stone", "fiber", "clay", "ore", "water")),
        tuple((f"item.{name}", name) for name in ("plank", "stone_block", "metal_bar", "flour", "jam", "meal")),
        tuple((f"item.{name}", name) for name in ("coin", "seed_bag", "carrot_basket", "tomato_basket", "wheat_bundle", "fruit_basket")),
    )
    for row, mappings in enumerate(icon_rows):
        for column, (key, name) in enumerate(mappings):
            art = contain_alpha(grid_cell(sheet, 6, 8, column, row), (112, 112), 2)
            save_asset(key, "items", name, art, tags=["item", "production-atlas"])
            count += 1

    ui_mappings = (
        ("ui.toolbar", "toolbar"), ("ui.inventory_panel", "inventory_panel"),
        ("ui.description_panel", "description_panel"), ("ui.item_slot", "item_slot"),
        ("ui.placement_valid", "placement_valid"), ("ui.placement_invalid", "placement_invalid"),
    )
    for column, (key, name) in enumerate(ui_mappings):
        cell = grid_cell(sheet, 6, 8, column, 4)
        bbox = cell.getchannel("A").getbbox()
        art = cell.crop(bbox) if bbox else cell
        save_asset(key, "ui", name, art, tags=["ui", "production-atlas"])
        count += 1

    action_mappings = (
        ("ui.button.build", "button_build"), ("ui.button.plant", "button_plant"),
        ("ui.button.craft", "button_craft"), ("ui.button.sell", "button_sell"),
        ("ui.button.settings", "button_settings"), ("ui.button.pause", "button_pause"),
    )
    for column, (key, name) in enumerate(action_mappings):
        save_asset(key, "ui", name, contain_alpha(grid_cell(sheet, 6, 8, column, 5), (112, 112), 2), tags=["ui", "button", "production-atlas"])
        count += 1

    nature_mappings = (
        ("nature.grass.1", "grass_1"), ("nature.flower.1", "flower_1"), ("nature.flower.2", "flower_2"),
        ("nature.rock.2", "rock_2"), ("nature.fence", "fence"), ("nature.gate", "gate"),
    )
    for column, (key, name) in enumerate(nature_mappings):
        save_asset(key, "nature", name, contain_alpha(grid_cell(sheet, 6, 8, column, 6), (160, 144), 2), tags=["nature", "production-atlas"])
        count += 1

    decor_mappings = (
        ("building.signpost", "signpost"), ("nature.flower_box", "flower_box"), ("nature.fountain", "fountain"),
        ("building.lantern", "lantern"), ("nature.mushrooms", "mushrooms"), ("item.crystal", "crystal"),
    )
    for column, (key, name) in enumerate(decor_mappings):
        category = "buildings" if key.startswith("building.") else ("items" if key.startswith("item.") else "nature")
        target = (224, 192) if category != "items" else (112, 112)
        save_asset(key, category, name, contain_alpha(grid_cell(sheet, 6, 8, column, 7), target, 2), tags=[category.rstrip("s"), "production-atlas"])
        count += 1
    return count


def crop_effects_atlas(path: Path) -> int:
    sheet = Image.open(path).convert("RGBA")
    names = ("build_dust", "construction_complete", "harvest_burst", "hit_rock", "hit_wood", "smoke", "water_splash")
    for row, name in enumerate(names):
        strip = Image.new("RGBA", (128 * 6, 128), (0, 0, 0, 0))
        for column in range(6):
            frame = contain_alpha(grid_cell(sheet, 6, 7, column, row), (128, 128), 1)
            strip.alpha_composite(frame, (column * 128, 0))
        save_asset(f"effect.{name}", "effects", name, strip, fmt="png", frames=6, frame_size=(128, 128), duration=95, tags=["effect", name, "sprite-sheet", "production-atlas"])
    return len(names) * 6


def process_production_atlases(crop_catalog):
    processed = 0
    environment = INCOMING / "environment-buildings-atlas.png"
    crops = INCOMING / "crops-atlas.png"
    player = INCOMING / "player-atlas.png"
    ui_items = INCOMING / "ui-items-atlas.png"
    effects = INCOMING / "effects-atlas.png"
    world = INCOMING / "world-background.png"
    if environment.exists(): processed += crop_environment_atlas(environment)
    if crops.exists():
        crop_count, crop_catalog = crop_crops_atlas(crops)
        processed += crop_count
    if player.exists(): processed += crop_player_atlas(player)
    if ui_items.exists(): processed += crop_ui_items_atlas(ui_items)
    if effects.exists(): processed += crop_effects_atlas(effects)
    if world.exists():
        with Image.open(world) as source:
            background = source.convert("RGB")
            save_asset("background.world", "background", "world", background, tags=["background", "production-atlas"])
            processed += 1
    return processed, crop_catalog


def alias_asset(alias: str, target: str):
    if target not in MANIFEST:
        raise KeyError(f"Cannot alias {alias}: missing target {target}")
    entry = dict(MANIFEST[target])
    entry["aliasOf"] = target
    MANIFEST[alias] = entry


def add_runtime_aliases():
    tile_aliases = {
        "tiles.grass_1": "tile.grass_01", "tiles.grass_2": "tile.grass_02", "tiles.grass_3": "tile.grass_03",
        "tiles.bare": "tile.soil_bare", "tiles.tilled": "tile.soil_tilled", "tiles.wet": "tile.soil_wet",
        "tiles.path_dirt": "tile.path_dirt", "tiles.path_stone": "tile.path_stone", "tiles.water": "tile.water",
    }
    for alias, target in tile_aliases.items(): alias_asset(alias, target)

    crop_ids = [name for name, _, _ in CROPS]
    stage_names = ("sown", "sprout", "young", "mature", "harvest")
    for crop_id in crop_ids:
        for index, stage in enumerate(stage_names):
            target = f"crop.{crop_id}.{stage}"
            for alias in (f"{crop_id}-{stage}", f"crops.{crop_id}.stage_{index}", f"crops.{crop_id}_{index}"):
                alias_asset(alias, target)
    for legacy, current in (("lettuce", "cabbage"),):
        for stage in stage_names:
            alias_asset(f"crop.{legacy}.{stage}", f"crop.{current}.{stage}")

    resource_items = ("wood", "stone", "fiber", "clay", "ore", "water", "hardwood", "coal")
    material_items = ("plank", "stone_block", "metal_ingot", "flour", "glass", "rope")
    product_items = ("berry_jam", "tomato_soup", "vegetable_stew", "bread", "apple_preserve", "lavender_oil")
    tool_items = ("axe", "pickaxe", "hoe", "watering_can")
    for item_id in resource_items + material_items + product_items + ("apple",):
        alias_asset(f"item-{item_id}", f"item.{item_id}")
        alias_asset(f"items.{item_id}", f"item.{item_id}")
    for crop_id in crop_ids:
        alias_asset(f"item-{crop_id}_seed", f"crop.{crop_id}.seed")
        alias_asset(f"items.{crop_id}_seed", f"crop.{crop_id}.seed")
        alias_asset(f"item-{crop_id}", f"crop.{crop_id}.product")
        alias_asset(f"items.{crop_id}", f"crop.{crop_id}.product")
        alias_asset(f"item.{crop_id}", f"crop.{crop_id}.product")
    for item_id in tool_items:
        alias_asset(f"item-{item_id}", f"tool.{item_id}")
        alias_asset(f"items.{item_id}", f"tool.{item_id}")

    building_targets = {
        "cottage": "house_1", "homestead": "house_2", "garden_manor": "house_3",
        "storage": "storage", "sawmill": "sawmill", "masonry": "stoneworks", "well": "well",
        "windmill": "windmill", "greenhouse": "greenhouse", "coop": "coop", "kitchen": "kitchen",
        "market": "market", "smelter": "smelter", "bridge": "bridge", "fence": "fence", "gate": "gate",
        "garden_lamp": "lantern", "bench": "bench", "signpost": "signpost", "flower_arch": "flower_arch",
    }
    for building_id, target_id in building_targets.items():
        base = f"building.{target_id}"
        for alias in (f"building-{building_id}", f"building.{building_id}", f"buildings.{building_id}"):
            alias_asset(alias, base)
        alias_asset(f"building-{building_id}-construction", f"{base}.construction")
        alias_asset(f"building-{building_id}-shadow", f"{base}.shadow")
        alias_asset(f"building.{building_id}.construction", f"{base}.construction")
        alias_asset(f"building.{building_id}.shadow", f"{base}.shadow")
        alias_asset(f"building.{building_id}.active", f"{base}.active")

    nature_targets = {
        "tree": "nature.tree.oak", "pine": "nature.tree.pine", "fruit_tree": "nature.tree.fruit.apple",
        "rock": "nature.rock", "ore_rock": "nature.rock", "weed": "nature.grass", "clay_mound": "nature.rock",
    }
    for node_type, target_prefix in nature_targets.items():
        for variant in range(1, 4):
            target = target_prefix if node_type == "fruit_tree" else f"{target_prefix}.{variant}"
            alias_asset(f"nature-{node_type}-{variant}", target)
        alias_asset(f"nature-{node_type}-shadow", "effect.shadow_actor")

    for alias, target in {
        "ui.valid": "ui.placement_valid", "ui.invalid": "ui.placement_invalid",
        "ui.button_inventory": "ui.inventory_panel", "ui.button_build": "ui.button.build",
        "ui.button_craft": "ui.button.craft", "ui.button_shop": "ui.button.sell",
        "ui.button_quests": "ui.quest_panel", "ui.button_settings": "ui.button.settings",
    }.items():
        alias_asset(alias, target)


def write_manifest(crop_catalog):
    sources = {value["src"] for value in MANIFEST.values()}
    payload={
        "version": 1,
        "artDirection": "warm hand-painted 2.5D isometric garden",
        "basePath": "/assets/",
        "meta": {"tileWidth": 128, "tileHeight": 64},
        "assets": dict(sorted(MANIFEST.items())),
        "cropCatalog": crop_catalog,
        "totals": {
            "files": len(sources),
            "entries": len(MANIFEST),
            "animated": sum(1 for v in MANIFEST.values() if v.get("animated") or v.get("frames",1)>1),
            "byCategory": {category: len({v["src"] for v in MANIFEST.values() if f"/assets/{category}/" in v["src"]}) for category in CATEGORIES},
        },
    }
    (OUT/"manifest.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (OUT/"LICENSES.txt").write_text(
        "BoardYume Original Raster Art Pack\n\n"
        "All files generated by scripts/process-atlases.py are original project assets.\n"
        "They may be used, modified, and redistributed as part of BoardYume.\n"
        "No third-party art is included in this generated pack.\n",
        encoding="utf-8",
    )
    return payload


def main():
    for category in CATEGORIES: (OUT/category).mkdir(parents=True,exist_ok=True)
    atlas_count=process_incoming()
    generate_tiles()
    crop_catalog=generate_crops()
    generate_nature()
    generate_buildings()
    generate_items()
    generate_character()
    generate_effects()
    generate_ui()
    production_count, crop_catalog = process_production_atlases(crop_catalog)
    add_runtime_aliases()
    payload=write_manifest(crop_catalog)
    print(f"Processed atlas regions: {atlas_count}")
    print(f"Processed production atlas regions: {production_count}")
    print(json.dumps(payload["totals"],indent=2))


if __name__=="__main__":
    main()
