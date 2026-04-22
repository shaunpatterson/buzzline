#!/usr/bin/env python3
"""Generate placeholder Buzzline icons (pure stdlib, no PIL)."""
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
os.makedirs(OUT_DIR, exist_ok=True)

# Gradient stops for the icon (matches the Classic scheme).
STOPS = [
    (0.00, (0, 0, 0)),
    (0.33, (31, 79, 176)),
    (0.66, (0, 0, 0)),
    (1.00, (176, 42, 42)),
]


def lerp(a, b, t):
    return int(a + (b - a) * t)


def sample(t):
    t = max(0.0, min(1.0, t))
    for i in range(len(STOPS) - 1):
        t0, c0 = STOPS[i]
        t1, c1 = STOPS[i + 1]
        if t0 <= t <= t1:
            k = 0 if t1 == t0 else (t - t0) / (t1 - t0)
            return (lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k))
    return STOPS[-1][1]


def rounded_rect_mask(size, radius):
    mask = bytearray(size * size)
    for y in range(size):
        for x in range(size):
            dx = 0
            dy = 0
            if x < radius:
                dx = radius - x
            elif x > size - 1 - radius:
                dx = x - (size - 1 - radius)
            if y < radius:
                dy = radius - y
            elif y > size - 1 - radius:
                dy = y - (size - 1 - radius)
            d = (dx * dx + dy * dy) ** 0.5
            if d <= radius:
                mask[y * size + x] = 255
            elif d <= radius + 1:
                mask[y * size + x] = int(255 * (radius + 1 - d))
            else:
                mask[y * size + x] = 0
    return mask


def draw_letter_b(size):
    """Return a size*size alpha mask (0..255) roughly shaped like a capital B."""
    mask = bytearray(size * size)
    left = int(size * 0.28)
    right = int(size * 0.72)
    top = int(size * 0.22)
    bot = int(size * 0.78)
    mid = (top + bot) // 2
    stem_w = max(2, int(size * 0.10))
    bowl_w = max(2, int(size * 0.10))
    upper_r = (mid - top) / 2 + 1
    lower_r = (bot - mid) / 2 + 1
    upper_cx = (left + right) / 2
    upper_cy = (top + mid) / 2
    lower_cx = (left + right) / 2
    lower_cy = (mid + bot) / 2

    def set(x, y, v=255):
        if 0 <= x < size and 0 <= y < size:
            if mask[y * size + x] < v:
                mask[y * size + x] = v

    # Vertical stem on the left.
    for y in range(top, bot + 1):
        for x in range(left, left + stem_w):
            set(x, y)
    # Upper bowl (annulus).
    for y in range(top, mid + 1):
        for x in range(left, right + 1):
            dx = x - upper_cx
            dy = y - upper_cy
            d = (dx * dx + dy * dy) ** 0.5
            if upper_r - bowl_w <= d <= upper_r:
                set(x, y)
    # Lower bowl (annulus).
    for y in range(mid, bot + 1):
        for x in range(left, right + 1):
            dx = x - lower_cx
            dy = y - lower_cy
            d = (dx * dx + dy * dy) ** 0.5
            if lower_r - bowl_w <= d <= lower_r:
                set(x, y)
    # Close the bowls on the stem side.
    for y in (top, mid, bot):
        for x in range(left, right):
            if y < size:
                set(x, y)
    return mask


def build_rgba(size):
    radius = max(2, int(size * 0.18))
    rrect = rounded_rect_mask(size, radius)
    letter = draw_letter_b(size)
    pixels = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            idx = y * size + x
            bg_alpha = rrect[idx]
            if bg_alpha == 0:
                continue
            t = x / max(1, size - 1)
            r, g, b = sample(t)
            lr, lg, lb = 255, 255, 255  # white letter
            la = letter[idx]
            # Composite: background gradient, then white letter on top.
            if la > 0:
                fr = (lr * la + r * (255 - la)) // 255
                fg = (lg * la + g * (255 - la)) // 255
                fb = (lb * la + b * (255 - la)) // 255
            else:
                fr, fg, fb = r, g, b
            off = idx * 4
            pixels[off] = fr
            pixels[off + 1] = fg
            pixels[off + 2] = fb
            pixels[off + 3] = bg_alpha
    return bytes(pixels)


def png_chunk(type_bytes, data):
    return (
        struct.pack(">I", len(data))
        + type_bytes
        + data
        + struct.pack(">I", zlib.crc32(type_bytes + data) & 0xFFFFFFFF)
    )


def write_png(path, size, rgba):
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)  # filter: None
        raw += rgba[y * stride : (y + 1) * stride]
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(signature)
        f.write(png_chunk(b"IHDR", ihdr))
        f.write(png_chunk(b"IDAT", idat))
        f.write(png_chunk(b"IEND", b""))


def main():
    for size in (16, 48, 128):
        print(f"generating {size}x{size}...")
        rgba = build_rgba(size)
        out = os.path.join(OUT_DIR, f"icon{size}.png")
        write_png(out, size, rgba)
        print(f"  wrote {out}")


if __name__ == "__main__":
    main()
