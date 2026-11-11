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


def knock_out_background(img: Image.Image, tol: int = 40) -> Image.Image:
    """Make the near-white background transparent.

    Flood-fills from every border pixel through pixels close to white, so
    white areas enclosed by the artwork (eyes, speech bubble) stay opaque.
    Background pixels get alpha proportional to their distance from white,
    which keeps the anti-aliased outline smooth instead of haloed.
    """
    from collections import deque

    w, h = img.size
    px = img.load()
    dist = lambda p: max(255 - p[0], 255 - p[1], 255 - p[2])
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        r, g, b, a = px[x, y]
        d = dist((r, g, b))
        if d > tol:
            continue
        # fully transparent near pure white, ramping up towards the outline
        px[x, y] = (r, g, b, int(a * d / tol) if d > 8 else 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                q.append((nx, ny))
    return img


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
    bee = knock_out_background(img.crop((x0, y0, x1, y1)))

    for size in SIZES:
        out = bee.resize((size, size), Image.LANCZOS)
        out.save(os.path.join(ICON_DIR, f"icon{size}.png"), optimize=True)
        print(f"wrote icons/icon{size}.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
