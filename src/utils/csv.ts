import type { StudentInput } from '../types';

/**
 * Minimal CSV parser — handles quoted fields, commas inside quotes,
 * and CRLF/LF line endings. Returns array of row arrays (no header logic).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some(cell => cell.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  // Last field/row (file may not end with newline)
  row.push(field);
  if (row.some(cell => cell.trim() !== '')) rows.push(row);

  return rows;
}

/**
 * Map CSV rows to student objects using a header row.
 * Recognized headers (case-insensitive): name, age, class, guardian,
 * contact, emergencycontact / emergency_contact / emergency contact.
 */
export interface CsvRowError {
  row: number;   // 1-based data row number (excluding header)
  reason: string;
}

export function csvToStudents(rows: string[][]): {
  students: StudentInput[];
  rowErrors: CsvRowError[];
  error?: string;
} {
  if (rows.length < 2) {
    return { students: [], rowErrors: [], error: 'CSV must have a header row and at least one data row' };
  }

  const header = rows[0].map(h =>
    h.trim().toLowerCase().replace(/[\s_-]+/g, '')
  );

  const colMap: Record<string, number> = {};
  header.forEach((h, i) => {
    if (['name', 'age', 'class', 'guardian', 'contact', 'emergencycontact'].includes(h)) {
      colMap[h] = i;
    }
  });

  if (colMap.name === undefined) {
    return { students: [], rowErrors: [], error: 'CSV must include a "name" column' };
  }

  const students: StudentInput[] = [];
  const rowErrors: CsvRowError[] = [];

  rows.slice(1).forEach((r, i) => {
    const name = (r[colMap.name] || '').trim();
    if (!name) {
      rowErrors.push({ row: i + 1, reason: 'Missing name' });
      return;
    }
    students.push({
      name,
      age: colMap.age !== undefined ? (r[colMap.age] || '').trim() : '',
      class: colMap.class !== undefined ? (r[colMap.class] || '').trim() : '',
      guardian: colMap.guardian !== undefined ? (r[colMap.guardian] || '').trim() : '',
      contact: colMap.contact !== undefined ? (r[colMap.contact] || '').trim() : '',
      emergencyContact: colMap.emergencycontact !== undefined ? (r[colMap.emergencycontact] || '').trim() : '',
    });
  });

  return { students, rowErrors };
}
