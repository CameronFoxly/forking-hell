"""Build an original outline pixel font from the game's own bitmap glyphs (MIT)."""
import re
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

source = Path("src/pixel.ts").read_text()
glyphs = {(quoted or bare): pattern for quoted, bare, pattern in re.findall(r"(?:'([^']+)'|([A-Z])):\s*'([01/]+)'", source)}
glyphs.update({
    " ": "000/000/000/000/000/000/000",
    ",": "0/0/0/0/0/1/1/1", "'": "1/1/0/0/0/0/0",
    '"': "101/101/000/000/000/000/000", ";": "0/1/0/0/1/1/1",
    "(": "001/010/100/100/100/010/001", ")": "100/010/001/001/001/010/100",
    "[": "111/100/100/100/100/100/111", "]": "111/001/001/001/001/001/111",
    "&": "01100/10010/10100/01000/10101/10010/01101",
    "%": "11001/11010/00010/00100/01000/01011/10011",
    "#": "01010/11111/01010/01010/11111/01010/01010",
    "_": "00000/00000/00000/00000/00000/00000/11111",
    "*": "00000/10101/01110/11111/01110/10101/00000",
    "|": "1/1/1/1/1/1/1", "\\": "10000/01000/01000/00100/00010/00010/00001",
    "@": "01110/10001/10111/10101/10111/10000/01111",
    "←": "00000/00100/01000/11111/01000/00100/00000",
    "→": "00000/00100/00010/11111/00010/00100/00000",
    "↑": "00100/01110/10101/00100/00100/00100/00100",
    "↓": "00100/00100/00100/00100/10101/01110/00100",
    "↗": "11111/00011/00101/01001/10001/00000/00000",
    "×": "00000/10001/01010/00100/01010/10001/00000",
    "·": "000/000/000/010/000/000/000",
    "²": "110/010/100/110/000/000/000",
    "…": "00000/00000/00000/00000/00000/00000/10101",
})
for lower in "abcdefghijklmnopqrstuvwxyz":
    glyphs[lower] = glyphs[lower.upper()]
for char in "–—":
    glyphs[char] = glyphs["-"]
for char in "‘’":
    glyphs[char] = glyphs["'"]
for char in "“”":
    glyphs[char] = glyphs['"']
for number in range(32, 127):
    glyphs.setdefault(chr(number), glyphs["?"])

order = [".notdef"] + [f"uni{ord(char):04X}" for char in sorted(glyphs)]
outlines, metrics = {}, {}
for name, pattern in [(".notdef", glyphs["?"])] + [(f"uni{ord(char):04X}", glyphs[char]) for char in sorted(glyphs)]:
    pen = TTGlyphPen(None)
    rows = pattern.split("/")
    for y, row in enumerate(rows):
        for x, value in enumerate(row):
            if value != "1":
                continue
            left, bottom = x * 100, (6 - y) * 100
            pen.moveTo((left, bottom))
            pen.lineTo((left, bottom + 100))
            pen.lineTo((left + 100, bottom + 100))
            pen.lineTo((left + 100, bottom))
            pen.closePath()
    outlines[name] = pen.glyph()
    metrics[name] = ((max(map(len, rows)) + 1) * 100, 0)
font = FontBuilder(1000, isTTF=True)
font.setupGlyphOrder(order)
font.setupCharacterMap({ord(char): f"uni{ord(char):04X}" for char in glyphs})
font.setupGlyf(outlines)
font.setupHorizontalMetrics(metrics)
font.setupHorizontalHeader(ascent=800, descent=-200)
font.setupNameTable({
    "familyName": "Fork Pixel", "styleName": "Regular",
    "uniqueFontIdentifier": "Fork Pixel 1.0", "fullName": "Fork Pixel Regular",
    "psName": "ForkPixel-Regular", "version": "Version 1.0",
    "copyright": "Original Forking Hell bitmap glyphs. MIT License.",
})
font.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
font.setupPost()
font.setupMaxp()
font.font["head"].created = font.font["head"].modified = 3867264000
font.save("public/assets/fork-pixel.ttf")
print(f"Generated Fork Pixel with {len(glyphs)} original glyph mappings")
