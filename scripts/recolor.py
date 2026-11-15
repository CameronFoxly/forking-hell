"""Rebuild the production atlas from the user-authored sheet. Requires Pillow."""
import sys
import json
from pathlib import Path
from PIL import Image

source = Image.open(sys.argv[1]).convert("RGBA")
if source.size != (130, 135):
    raise ValueError("Expected the authored 130 x 135 Octocat sheet")

palette = {
    (65, 59, 108): "#6951a6", (255, 227, 215): "#d5b0ff",
    (255, 236, 230): "#f5ecff", (47, 43, 77): "#352558",
    (72, 75, 124): "#a17be3", (159, 148, 188): "#75f6ec",
    (255, 200, 173): "#a17be3", (160, 154, 178): "#d5b0ff",
    (0, 28, 77): "#14102b", (253, 159, 226): "#75f6ec",
}
for y in range(source.height):
    for x in range(source.width):
        r, g, b, a = source.getpixel((x, y))
        if a:
            color = palette[(r, g, b)]
            source.putpixel((x, y), (*tuple(int(color[i:i + 2], 16) for i in (1, 3, 5)), a))

metadata = json.loads(Path(sys.argv[2]).read_text())
if metadata["meta"]["size"] != {"w": 130, "h": 135}:
    raise ValueError("Unexpected atlas dimensions")
for frame in metadata["frames"].values():
    if frame["frame"]["w"] != 26 or frame["frame"]["h"] != 27 or frame["trimmed"] or frame["rotated"]:
        raise ValueError("Expected untrimmed, unrotated 26 x 27 frames")
# Keep the original sheet, transparent margins and pivots. Only colors change.
output = Path("public/assets/octocat.png")
output.parent.mkdir(parents=True, exist_ok=True)
source.save(output)
metadata["meta"] = {"image": "octocat.png", "size": metadata["meta"]["size"]}
output.with_suffix(".json").write_text(json.dumps(metadata, indent=2) + "\n")
print(f"Recolored {len(metadata['frames'])} untrimmed poses; preserved the authoritative labeled atlas")
