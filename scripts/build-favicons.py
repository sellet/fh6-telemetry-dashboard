#!/usr/bin/env python3
"""Generate the favicon set for the FH6 Telemetry Dashboard.

Produces PNGs at the sizes browsers + Apple devices look for, a multi-size
favicon.ico, and a maskable Android PWA icon, plus a site.webmanifest.

Re-run via `npm run build:favicons` whenever the icon design changes.
"""

from pathlib import Path
import math

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "src" / "client" / "public"
OUT.mkdir(parents=True, exist_ok=True)

BG = (10, 12, 16, 255)         # #0a0c10 — cockpit-bg
ACCENT = (255, 107, 26, 255)   # #ff6b1a — cockpit-accent
DIM = (60, 70, 90, 255)        # muted tick colour

# Sizes that browsers/Apple/Android actually request.
SIZES = {
    "favicon-16x16.png": 16,
    "favicon-32x32.png": 32,
    "apple-touch-icon.png": 180,
    "android-chrome-192x192.png": 192,
    "android-chrome-512x512.png": 512,
    "icon-512.png": 512,  # source-of-truth high-res
}
ICO_SIZES = (16, 32, 48)


def render(size: int, *, rounded: bool = True) -> Image.Image:
    """Draw the FH6 telemetry icon at `size` × `size`.

    Layout (proportional to size):
      * rounded-square dark background
      * 270° tachometer arc (top + sides) in the cockpit accent colour
      * thicker tick mark at the top centre ("zero" indicator)
      * orange chevron pointer in the lower half, matching the in-app
        car marker
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    s = size  # alias for terseness
    radius = int(s * 0.20) if rounded else 0
    if rounded:
        d.rounded_rectangle((0, 0, s - 1, s - 1), radius=radius, fill=BG)
    else:
        d.rectangle((0, 0, s - 1, s - 1), fill=BG)

    cx, cy = s / 2, s / 2

    # Speedometer arc — drawn as a fat ring with the bottom 90° cut out.
    ring_outer = s * 0.42
    ring_inner = s * 0.32
    arc_box_outer = (cx - ring_outer, cy - ring_outer, cx + ring_outer, cy + ring_outer)
    arc_box_inner = (cx - ring_inner, cy - ring_inner, cx + ring_inner, cy + ring_inner)

    # Pieslice from 135° → 405° (i.e. -45° via the top), then mask the inner
    # circle to leave a thick arc.
    d.pieslice(arc_box_outer, start=135, end=45, fill=ACCENT)
    d.pieslice(arc_box_inner, start=0, end=360, fill=BG)

    # A small "zero" tick at the top of the arc — only render where it adds
    # legibility (skip at the smallest pixel sizes).
    if s >= 32:
        tick_w = max(1, int(s * 0.04))
        tick_h = max(2, int(s * 0.10))
        d.rounded_rectangle(
            (cx - tick_w / 2, cy - ring_outer - tick_h * 0.6,
             cx + tick_w / 2, cy - ring_outer + tick_h * 0.4),
            radius=max(1, tick_w // 2),
            fill=DIM,
        )

    # Chevron pointer — matches the in-app car marker style.
    # Points: top, bottom-right, indent, bottom-left
    cw = s * 0.32   # half-width
    ct = s * 0.22   # top y offset above centre
    cb = s * 0.30   # bottom y offset below centre
    indent = s * 0.07
    chevron = [
        (cx, cy - ct),
        (cx + cw, cy + cb),
        (cx, cy + cb - indent),
        (cx - cw, cy + cb),
    ]
    d.polygon(chevron, fill=ACCENT)

    return img


def main() -> None:
    base = render(512)
    for filename, size in SIZES.items():
        img = base.resize((size, size), Image.LANCZOS) if size != 512 else base
        img.save(OUT / filename, format="PNG", optimize=True)
        print(f"wrote {filename} ({size}×{size})")

    # Maskable variant — Android PWA expects a 512 maskable icon with the
    # focal artwork inside the inner 80% "safe" area; render full-bleed bg.
    mask = render(512, rounded=False)
    mask.save(OUT / "icon-maskable-512.png", format="PNG", optimize=True)
    print("wrote icon-maskable-512.png (512×512)")

    # Multi-size .ico for legacy browsers.
    ico_layers = [render(s) for s in ICO_SIZES]
    ico_layers[0].save(
        OUT / "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
        append_images=ico_layers[1:],
    )
    print(f"wrote favicon.ico ({', '.join(f'{s}×{s}' for s in ICO_SIZES)})")

    # PWA manifest.
    manifest = """\
{
  "name": "FH6 Telemetry Dashboard",
  "short_name": "FH6 Telemetry",
  "description": "Real-time Forza Horizon 6 telemetry visualisation",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0c10",
  "theme_color": "#0a0c10",
  "icons": [
    { "src": "/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
"""
    (OUT / "site.webmanifest").write_text(manifest)
    print("wrote site.webmanifest")


if __name__ == "__main__":
    main()
