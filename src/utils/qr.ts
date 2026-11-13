/**
 * QR code generation for student IDs.
 * The QR payload is the plain student ID (e.g. "RHA001") —
 * that's exactly what the scanner expects.
 *
 * generateQrCardDataUrl renders a printable ID card:
 * org header + QR code + student name + ID, all in one PNG.
 */

import QRCode from 'qrcode';
import type { Student } from '../types';

export async function generateQrDataUrl(
  studentId: string,
  size = 320
): Promise<string> {
  return QRCode.toDataURL(studentId.trim().toUpperCase(), {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: size,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const CARD_W = 640;
const CARD_H = 880;
const QR_SIZE = 440;
const QR_X = (CARD_W - QR_SIZE) / 2;
const QR_Y = 140;

export async function generateQrCardDataUrl(student: Student): Promise<string> {
  const qrDataUrl = await generateQrDataUrl(student.id, QR_SIZE);
  const qrImg = await loadImage(qrDataUrl);

  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  // Card background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Green header band
  ctx.fillStyle = '#1f7a3f';
  ctx.fillRect(0, 0, CARD_W, 110);

  // Org name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ROBIN HOOD ARMY', CARD_W / 2, 56);

  ctx.font = '24px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('Student Attendance ID', CARD_W / 2, 92);

  // QR code with a light border
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(QR_X - 14, QR_Y - 14, QR_SIZE + 28, QR_SIZE + 28, 24);
  ctx.fill();
  ctx.stroke();
  ctx.drawImage(qrImg, QR_X, QR_Y, QR_SIZE, QR_SIZE);

  // Student name
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 38px system-ui, sans-serif';
  ctx.fillText(student.name, CARD_W / 2, QR_Y + QR_SIZE + 70);

  // Student ID
  ctx.fillStyle = '#1f7a3f';
  ctx.font = 'bold 30px ui-monospace, monospace';
  ctx.fillText(student.id, CARD_W / 2, QR_Y + QR_SIZE + 125);

  // Class (optional line)
  if (student.class) {
    ctx.fillStyle = '#6b7280';
    ctx.font = '26px system-ui, sans-serif';
    ctx.fillText(`Class ${student.class}`, CARD_W / 2, QR_Y + QR_SIZE + 172);
  }

  // Footer
  ctx.fillStyle = '#9ca3af';
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText('Scan at the attendance desk', CARD_W / 2, CARD_H - 50);

  return canvas.toDataURL('image/png');
}

export function downloadQrPng(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
