// CSV for spreadsheet programs. Every cell is quoted. A cell starting with = + - @ (or tab / CR)
// is prefixed with ' so Excel shows it as text instead of running it as a formula: subscriber
// emails are typed by visitors. The BOM makes Excel read the file as UTF-8 (Vietnamese).
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: string[][]): string {
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
