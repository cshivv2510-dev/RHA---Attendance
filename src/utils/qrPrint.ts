/**
 * Print QR ID cards — 8 per A4 page PDF.
 * Each card: logo/org header, QR code, name, ID, class.
 */
import jsPDF from 'jspdf';
import { generateQrDataUrl } from './qr';
import type { Student } from '../types';
import logoUrl from '../assets/logo.png';

const A4_W = 210;
const A4_H = 297;
const MARGIN = 10;
const COLS = 2;
const ROWS = 4;
const CARDS_PER_PAGE = COLS * ROWS;
const CARD_W = (A4_W - MARGIN * 2 - 6) / COLS;
const CARD_H = (A4_H - MARGIN * 2 - 9) / ROWS;
const GREEN: [number, number, number] = [31, 122, 63];

let logoDataUrlPromise: Promise<string | null> | null = null;

function getLogoDataUrl(): Promise<string | null> {
  if (!logoDataUrlPromise) {
    logoDataUrlPromise = fetch(logoUrl)
      .then(r => r.blob())
      .then(blob => new Promise<string | null>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      }))
      .catch(() => null);
  }
  return logoDataUrlPromise;
}

/**
 * Print QR ID cards — 8 per A4 page PDF.
 * Pre-generates all QR data URLs, then builds the PDF.
 */
export async function printQrCardsPdf(students: Student[]): Promise<void> {
  const logo = await getLogoDataUrl();
  const qrUrls = await Promise.all(
    students.map(s => generateQrDataUrl(s.id, 400).catch(() => null))
  );

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  students.forEach((student, idx) => {
    const pageIdx = Math.floor(idx / CARDS_PER_PAGE);
    const within = idx % CARDS_PER_PAGE;
    if (pageIdx > 0 && within === 0) doc.addPage();

    const col = within % COLS;
    const row = Math.floor(within / COLS);
    const x = MARGIN + col * (CARD_W + 6);
    const y = MARGIN + row * (CARD_H + 3);

    // Card border
    doc.setDrawColor(220, 230, 224);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, CARD_W, CARD_H, 3, 3);

    // Green header strip
    doc.setFillColor(...GREEN);
    doc.rect(x, y, CARD_W, 16, 'F');

    if (logo) {
      try { doc.addImage(logo, 'PNG', x + 3, y + 2.5, 11, 11); } catch { /* ignore */ }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('ROBIN HOOD ARMY', x + (logo ? 17 : 5), y + 8);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Student Attendance ID', x + (logo ? 17 : 5), y + 13.5);

    // QR code
    const qr = qrUrls[idx];
    const qrSize = CARD_H - 34;
    if (qr) {
      try {
        doc.addImage(qr, 'PNG', x + (CARD_W - qrSize) / 2, y + 19, qrSize, qrSize);
      } catch { /* ignore */ }
    }

    // Name / ID / class
    const textY = y + CARD_H - 12;
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    const name = student.name.length > 22 ? student.name.slice(0, 21) + '…' : student.name;
    doc.text(name, x + CARD_W / 2, textY, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GREEN);
    doc.text(student.id, x + CARD_W / 2, textY + 5, { align: 'center' });
    if (student.class) {
      doc.setTextColor(110, 110, 110);
      doc.text(`Class ${student.class}`, x + CARD_W / 2, textY + 9.5, { align: 'center' });
    }
  });

  doc.save('RHA-id-cards.pdf');
}
