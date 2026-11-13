#!/usr/bin/env python3
"""
Robin Hood Army — QR Code Generator

Generates QR code PNG images for student ID cards.
Each QR code contains ONLY the student ID (e.g., RHA001).

Usage:
    pip install qrcode[pil]
    python generate_qr.py

Options:
    --start     Starting number (default: 1)
    --count     Number of QR codes to generate (default: 100)
    --prefix    ID prefix (default: RHA)
    --output    Output directory (default: ./output/qr_codes)
    --csv       Path to CSV file with student IDs (optional)

Examples:
    python generate_qr.py                           # Generates RHA001 to RHA100
    python generate_qr.py --start 1 --count 50      # Generates RHA001 to RHA050
    python generate_qr.py --csv students.csv         # Reads IDs from CSV
"""

import os
import sys
import argparse
import csv

try:
    import qrcode
    from qrcode.image.styledpil import StyledPilImage
except ImportError:
    print("Please install the qrcode library:")
    print("  pip install qrcode[pil]")
    sys.exit(1)

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Please install Pillow:")
    print("  pip install Pillow")
    sys.exit(1)


def generate_qr(student_id: str, output_dir: str) -> str:
    """Generate a QR code PNG for a student ID."""

    # Create QR code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=4,
    )
    qr.add_data(student_id)
    qr.make(fit=True)

    # Generate QR image
    qr_img = qr.make_image(fill_color="#0f4422", back_color="white").convert("RGB")
    qr_width, qr_height = qr_img.size

    # Create final image with label below
    padding = 20
    label_height = 50
    final_width = qr_width + (padding * 2)
    final_height = qr_height + (padding * 2) + label_height

    final_img = Image.new("RGB", (final_width, final_height), "white")
    final_img.paste(qr_img, (padding, padding))

    # Add student ID text below QR code
    draw = ImageDraw.Draw(final_img)

    # Try to use a nice font, fall back to default
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)
    except (OSError, IOError):
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
        except (OSError, IOError):
            font = ImageFont.load_default()

    # Center the text
    text_bbox = draw.textbbox((0, 0), student_id, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_x = (final_width - text_width) // 2
    text_y = qr_height + padding + 10

    draw.text((text_x, text_y), student_id, fill="#0f4422", font=font)

    # Add thin green border
    border_color = "#1f7a3f"
    draw.rectangle(
        [(2, 2), (final_width - 3, final_height - 3)],
        outline=border_color,
        width=2,
    )

    # Save
    filepath = os.path.join(output_dir, f"{student_id}.png")
    final_img.save(filepath, "PNG")
    return filepath


def main():
    parser = argparse.ArgumentParser(
        description="Generate QR codes for Robin Hood Army student IDs"
    )
    parser.add_argument("--start", type=int, default=1, help="Starting number")
    parser.add_argument("--count", type=int, default=100, help="Number of QR codes")
    parser.add_argument("--prefix", type=str, default="RHA", help="ID prefix")
    parser.add_argument("--output", type=str, default="./output/qr_codes", help="Output directory")
    parser.add_argument("--csv", type=str, default=None, help="CSV file with student IDs")

    args = parser.parse_args()

    # Create output directory
    os.makedirs(args.output, exist_ok=True)

    student_ids = []

    if args.csv:
        # Read IDs from CSV file
        with open(args.csv, "r") as f:
            reader = csv.reader(f)
            for row in reader:
                if row and row[0].strip():
                    student_ids.append(row[0].strip())
        # Skip header if present
        if student_ids and not student_ids[0].upper().startswith(args.prefix):
            student_ids = student_ids[1:]
    else:
        # Generate sequential IDs
        for i in range(args.start, args.start + args.count):
            student_ids.append(f"{args.prefix}{i:03d}")

    print(f"🎯 Generating {len(student_ids)} QR codes...")
    print(f"📁 Output: {os.path.abspath(args.output)}")
    print()

    for i, student_id in enumerate(student_ids, 1):
        filepath = generate_qr(student_id, args.output)
        print(f"  ✅ [{i}/{len(student_ids)}] {student_id} → {filepath}")

    print()
    print(f"✨ Done! {len(student_ids)} QR codes saved to {os.path.abspath(args.output)}")
    print()
    print("Print these QR codes and attach them to student ID cards.")
    print("Each QR code contains only the student ID (no personal info).")


if __name__ == "__main__":
    main()
