"""
Generate JARVIS icon files from the SVG source.

Requirements:
    pip install cairosvg Pillow

Usage:
    python scripts/generate_icons.py
"""

import os
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).parent.parent
SVG_PATH = ROOT / "frontend" / "public" / "jarvis-icon.svg"
ELECTRON_ASSETS = ROOT / "electron" / "assets"
FRONTEND_PUBLIC = ROOT / "frontend" / "public"

ELECTRON_ASSETS.mkdir(parents=True, exist_ok=True)


def generate_with_cairosvg():
    import cairosvg
    from PIL import Image
    import io

    print("Generating icons with cairosvg + Pillow...")

    svg_data = SVG_PATH.read_bytes()

    sizes = [16, 24, 32, 48, 64, 128, 256, 512]
    pngs = {}

    for size in sizes:
        png_data = cairosvg.svg2png(bytestring=svg_data, output_width=size, output_height=size)
        pngs[size] = png_data
        print(f"  Generated {size}×{size} PNG")

    # Save main icon PNGs
    (ELECTRON_ASSETS / "icon.png").write_bytes(pngs[256])
    (ELECTRON_ASSETS / "tray-icon.png").write_bytes(pngs[32])
    (FRONTEND_PUBLIC / "favicon.png").write_bytes(pngs[32])
    print("  Saved icon.png, tray-icon.png, favicon.png")

    # Build Windows ICO (multi-resolution)
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    images = []
    for size in ico_sizes:
        img = Image.open(io.BytesIO(pngs[size])).convert("RGBA")
        images.append(img)

    ico_path = ELECTRON_ASSETS / "icon.ico"
    images[0].save(
        ico_path,
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=images[1:],
    )
    print(f"  Saved icon.ico ({ico_path})")
    print("\nAll icons generated successfully.")


def generate_fallback():
    """Fallback: generate a simple programmatic icon without cairosvg."""
    try:
        from PIL import Image, ImageDraw, ImageFont
        import io
        print("Generating fallback icons with Pillow (no SVG rendering)...")

        def make_jarvis_icon(size: int) -> Image.Image:
            img = Image.new("RGBA", (size, size), (2, 11, 24, 255))
            draw = ImageDraw.Draw(img)
            cx, cy = size // 2, size // 2
            r = size // 2

            # Outer ring
            draw.ellipse([4, 4, size - 4, size - 4], outline=(0, 212, 255, 200), width=max(1, size // 64))
            # Mid ring
            m = size // 6
            draw.ellipse([m, m, size - m, size - m], outline=(0, 170, 220, 120), width=max(1, size // 128))

            # Inner circle
            i = size // 3
            draw.ellipse([i, i, size - i, size - i], fill=(4, 22, 40, 255), outline=(0, 212, 255, 180), width=max(1, size // 80))

            # J letter
            font_size = max(8, size // 3)
            try:
                font = ImageFont.truetype("arial.ttf", font_size)
            except Exception:
                font = ImageFont.load_default()

            bbox = draw.textbbox((0, 0), "J", font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            draw.text((cx - tw // 2, cy - th // 2 - size // 20), "J", fill=(0, 212, 255, 255), font=font)

            return img

        sizes = [16, 24, 32, 48, 64, 128, 256]
        images = [make_jarvis_icon(s) for s in sizes]

        ELECTRON_ASSETS.mkdir(parents=True, exist_ok=True)
        images[-1].save(str(ELECTRON_ASSETS / "icon.png"))
        images[2].save(str(ELECTRON_ASSETS / "tray-icon.png"))
        images[2].save(str(FRONTEND_PUBLIC / "favicon.png"))

        images[0].save(
            str(ELECTRON_ASSETS / "icon.ico"),
            format="ICO",
            sizes=[(s, s) for s in sizes],
            append_images=images[1:],
        )
        print("Fallback icons generated.")
    except ImportError:
        print("Pillow not installed. Run: pip install Pillow")
        print("Manually copy frontend/public/jarvis-icon.svg to electron/assets/icon.png")


if __name__ == "__main__":
    try:
        generate_with_cairosvg()
    except ImportError:
        print("cairosvg not found, trying fallback...")
        generate_fallback()
    except Exception as e:
        print(f"cairosvg error: {e}, trying fallback...")
        generate_fallback()
