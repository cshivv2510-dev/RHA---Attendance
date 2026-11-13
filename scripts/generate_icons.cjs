/**
 * Script to generate PWA icons as simple canvas-based PNGs
 * Run this in any browser console or with Node + canvas
 */

// Since we need actual PNG files for the PWA manifest,
// we'll create a small script that generates them.
// For now, create placeholder SVGs that will render properly.

const fs = require('fs');
const { createCanvas } = require('canvas');

function generateIcon(size, outputPath) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#1f7a3f';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.15);
  ctx.fill();

  // Letter "R"
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * 0.5}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('R', size / 2, size / 2 + size * 0.02);

  // Small "HA" below
  ctx.font = `bold ${size * 0.15}px sans-serif`;
  ctx.fillText('HA', size / 2, size * 0.78);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Created ${outputPath} (${size}x${size})`);
}

// Generate icons
generateIcon(192, './public/icons/icon-192.png');
generateIcon(512, './public/icons/icon-512.png');
