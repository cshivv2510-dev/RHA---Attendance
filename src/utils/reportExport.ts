/**
 * Report exports — CSV / Excel / PDF including BOTH present and absent rows,
 * plus a per-student summary sheet in Excel.
 * Each builder returns a Blob so callers can share or download.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDate, formatTime } from './date';

export interface ReportRow {
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM:SS or '' for absent
  studentId: string;
  name: string;
  status: 'Present' | 'Absent';
  className?: string;
}

export interface StudentSummaryRow {
  studentId: string;
  name: string;
  className: string;
  daysPresent: number;
  daysAbsent: number;
  sessionDays: number;
  percentage: number | null;
}

export function reportFileBase(startDate: string, endDate: string): string {
  return `RHA-attendance_${startDate}_to_${endDate}`;
}

// ─── CSV ──────────────────────────────────────────────────────────

export function buildReportCSV(rows: ReportRow[]): Blob {
  const headers = ['Date', 'Time', 'Student ID', 'Name', 'Class', 'Status'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      r.date,
      r.time ? formatTime(r.time) : '',
      r.studentId,
      `"${r.name.replace(/"/g, '""')}"`,
      r.className ?? '',
      r.status,
    ].join(','));
  }
  return new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
}

// ─── Excel ────────────────────────────────────────────────────────

export function buildReportExcel(
  rows: ReportRow[],
  summary: StudentSummaryRow[]
): Blob {
  const wb = XLSX.utils.book_new();

  const detail = rows.map(r => ({
    Date: r.date,
    Time: r.time ? formatTime(r.time) : '',
    'Student ID': r.studentId,
    Name: r.name,
    Class: r.className ?? '',
    Status: r.status,
  }));
  const ws1 = XLSX.utils.json_to_sheet(detail);
  ws1['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 25 }, { wch: 8 }, { wch: 9 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Daily Records');

  const summ = summary.map(s => ({
    'Student ID': s.studentId,
    Name: s.name,
    Class: s.className,
    'Days Present': s.daysPresent,
    'Days Absent': s.daysAbsent,
    'Session Days': s.sessionDays,
    'Attendance %': s.percentage === null ? '' : `${s.percentage}%`,
  }));
  const ws2 = XLSX.utils.json_to_sheet(summ);
  ws2['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 8 }, { wch: 13 }, { wch: 12 }, { wch: 13 }, { wch: 13 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Student Summary');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ─── PDF ──────────────────────────────────────────────────────────

export function buildReportPDF(
  rows: ReportRow[],
  summary: StudentSummaryRow[],
  periodLabel: string
): Blob {
  const doc = new jsPDF();

  doc.setFontSize(20);
  doc.setTextColor(31, 122, 63);
  doc.text('Robin Hood Army', 14, 22);

  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text('Attendance Report', 14, 30);

  doc.setFontSize(10);
  doc.text(`Period: ${periodLabel}`, 14, 37);
  doc.text(`Generated: ${formatDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))}`, 14, 43);

  const present = rows.filter(r => r.status === 'Present').length;
  const absent = rows.length - present;
  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.text(`Present: ${present}  |  Absent: ${absent}  |  Students: ${summary.length}`, 14, 51);

  autoTable(doc, {
    startY: 57,
    head: [['Date', 'Time', 'Student ID', 'Name', 'Class', 'Status']],
    body: rows.map(r => [
      r.date,
      r.time ? formatTime(r.time) : '—',
      r.studentId,
      r.name,
      r.className ?? '',
      r.status,
    ]),
    headStyles: { fillColor: [31, 122, 63], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8, textColor: [60, 60, 60] },
    alternateRowStyles: { fillColor: [240, 250, 244] },
    styles: { cellPadding: 3, lineColor: [226, 235, 230], lineWidth: 0.1 },
    margin: { left: 14, right: 14 },
  });

  const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  autoTable(doc, {
    startY: lastY + 12,
    head: [['Student ID', 'Name', 'Class', 'Present', 'Absent', 'Attendance %']],
    body: summary.map(s => [
      s.studentId,
      s.name,
      s.className,
      s.daysPresent,
      s.daysAbsent,
      s.percentage === null ? '—' : `${s.percentage}%`,
    ]),
    headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8, textColor: [60, 60, 60] },
    styles: { cellPadding: 3 },
    margin: { left: 14, right: 14 },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Robin Hood Army — Attendance System  |  Page ${i} of ${pageCount}`, 14, doc.internal.pageSize.height - 10);
  }

  return doc.output('blob');
}

// ─── Share / download ─────────────────────────────────────────────

export async function shareOrDownload(blob: Blob, filename: string): Promise<void> {
  try {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
  } catch {
    return; // user cancelled share
  }
  downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
