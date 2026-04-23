#!/usr/bin/env python3
"""Generate the extension icons (16/48/128) by cropping the bee out of
assets/logo.png. The full wordmark in the source image is legible at large
sizes but unreadable as a toolbar icon, so we crop to just the bee + speech
bubble for the square icons.

Requires Pillow:  pip3 install --user Pillow
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO = os.path.join(ROOT, "assets", "logo.png")
ICON_DIR = os.path.join(ROOT, "icons")

# Bee crop box on the source logo (x0, y0, x1, y1). Tuned for the 1404x1122
# source image; contains the full bee + wing + antennae + speech bubble with
# a small margin, and stops above the "buzz line" wordmark which starts at
# row ~777.
CROP = (395, 165, 1025, 775)
SIZES = (16, 48, 128)


def main() -> int:
    if not os.path.isfile(LOGO):
        print(f"logo not found: {LOGO}", file=sys.stderr)
        return 1
    os.makedirs(ICON_DIR, exist_ok=True)

    img = Image.open(LOGO).convert("RGBA")
    w, h = img.size
    x0, y0, x1, y1 = CROP
    # Clamp to actual image bounds so it still works if the source is resized.
    x0 = max(0, min(x0, w))
    x1 = max(0, min(x1, w))
    y0 = max(0, min(y0, h))
    y1 = max(0, min(y1, h))
    bee = img.crop((x0, y0, x1, y1))

    for size in SIZES:
        out = bee.resize((size, size), Image.LANCZOS)
        out.save(os.path.join(ICON_DIR, f"icon{size}.png"), optimize=True)
        print(f"wrote icons/icon{size}.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
