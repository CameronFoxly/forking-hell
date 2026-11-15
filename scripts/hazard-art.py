"""Original hazard art: every authored cell is one source pixel / world pixel."""
import json
import math
from pathlib import Path
from PIL import Image

colors = {".": (0, 0, 0, 0), "s": "#352558", "v": "#a17be3", "p": "#d5b0ff",
          "c": "#75f6ec", "r": "#ff799d", "w": "#f5ecff"}
patterns = {
    "patrol": """
....s............s....
....sp..........ps....
....spv........vps....
.....svsssssssvs.....
...ssvpppppppppvss...
..svppvvvvvvvvvppvs..
.svpvssssssssssvpvs.
.spvs..rr..rr..svps.
.spvs..rw..rw..svps.
.spvs.........svps.
..svps...ss...spvs..
...svpsssssssspvs...
ss..svvvvvvvvvvs..ss
sp...ssssssssss...ps
.sp.sv........vs.ps.
..sspv........vpss..
...sp..........ps...
...ss..........ss...
""",
    "shooter": """
.........ss.........
........srrs........
........srrs........
.........ss.........
......ssssssss......
....ssppppppppss....
...spvvvvvvvvvvps...
..spvssssssssssvps..
.spvs...rr...svps.
sspvss..rr..ssvpss
spvvvssrrrrssvvvps
spvccvssssssvccvps
sspvccvvvvvvccvpss
..svppvvvvvvppvs..
...ssppppppppss...
.....ssssssss.....
....svppppppvs....
...svppssssppvs...
..ssssss..ssssss..
""",
    "gate-up": """
.....s...........s.....
....srs.........srs....
....srs....s....srs....
...srvrs..srs..srvrs...
...srvrs..srs..srvrs...
..srvvvrs.srs.srvvvrs..
..srvvvrs.srs.srvvvrs..
.srvvvvvrsrvrsrvvvvvrs.
.srvvvvvrsrvrsrvvvvvrs.
.spvvvvvvvvvvvvvvvvps.
.spvsssssssssssssvps.
..spvvvvvvvvvvvvvps..
...sssssssssssssss...
""",
    "gate-down": """
..ssssssssssssssssss..
.spvvvvvvvvvvvvvvvvps.
.spvsssssssssssssvps.
..sssssssssssssssss..
""",
}

def pixel_image(pattern):
    rows = pattern.strip().splitlines()
    width = max(map(len, rows))
    if width > 26 or len(rows) > 27:
        raise ValueError("Hazard frame exceeds character-scale source grid")
    image = Image.new("RGBA", (26, 27))
    for row, line in enumerate(rows):
        for col, value in enumerate(line):
            if value != ".":
                color = colors[value]
                image.putpixel((col + (26 - width) // 2, row + 27 - len(rows)),
                               tuple(int(color[i:i + 2], 16) for i in (1, 3, 5)) + (255,))
    return image

frames = {"patrol-0": pixel_image(patterns["patrol"])}
frames["patrol-1"] = frames["patrol-0"].copy()
for x in range(26):
    for y in range(23, 27):
        frames["patrol-1"].putpixel((x, y), (0, 0, 0, 0))
for x, y in [(6, 23), (5, 24), (4, 25), (19, 23), (20, 24), (21, 25)]:
    frames["patrol-1"].putpixel((x, y), (213, 176, 255, 255))
for name in ["shooter", "gate-up", "gate-down"]:
    frames[name] = pixel_image(patterns[name])
gate = Image.new("RGBA", (26, 27))
for center, height in [(5, 18), (13, 25), (21, 21)]:
    for y in range(26 - height, 26):
        half = min(3, (y - (26 - height)) // 5)
        for x in range(center - half, center + half + 1):
            edge = x in (center - half, center + half)
            gate.putpixel((x, y), (53, 37, 88, 255) if edge else (255, 121, 157, 255))
for x in range(2, 25):
    gate.putpixel((x, 25), (213, 176, 255, 255))
    gate.putpixel((x, 26), (53, 37, 88, 255))
frames["gate-up"] = gate

# Rasterize rotation on the same 1px world grid before the camera transform.
for index in range(16):
    image = Image.new("RGBA", (26, 27))
    angle = index * math.pi / 8
    for y in range(27):
        for x in range(26):
            dx, dy = x - 12, y - 13
            u = round(dx * math.cos(angle) + dy * math.sin(angle))
            v = round(-dx * math.sin(angle) + dy * math.cos(angle))
            radius = abs(u) + abs(v)
            color = None
            if (abs(u) <= 2 and abs(v) <= 11) or (abs(v) <= 2 and abs(u) <= 11):
                color = (213, 176, 255, 255)
            if radius <= 9:
                color = (161, 123, 227, 255)
            if radius <= 5:
                color = (53, 37, 88, 255)
            if abs(u) <= 1 and abs(v) <= 1:
                color = (255, 121, 157, 255)
            if color:
                image.putpixel((x, y), color)
    frames[f"spinner-{index}"] = image

atlas = Image.new("RGBA", (26 * len(frames), 27))
metadata = {"frames": {}, "meta": {"image": "hazards.png", "size": {"w": atlas.width, "h": atlas.height}}}
for i, (name, image) in enumerate(frames.items()):
    atlas.paste(image, (i * 26, 0))
    metadata["frames"][name] = {"frame": {"x": i * 26, "y": 0, "w": 26, "h": 27}, "rotated": False,
                               "trimmed": False, "spriteSourceSize": {"x": 0, "y": 0, "w": 26, "h": 27},
                               "sourceSize": {"w": 26, "h": 27}}
output = Path("public/assets")
output.mkdir(parents=True, exist_ok=True)
atlas.save(output / "hazards.png")
(output / "hazards.json").write_text(json.dumps(metadata, indent=2) + "\n")
print(f"Generated {len(frames)} original 26x27 hazard frames at 1 world pixel per texel")
