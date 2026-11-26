/** A CSV cell: text, a whole number, yes/no, or no value. */
export type CsvCell = string | number | boolean | null;

/**
 * D-029: CSV that Excel set to Romanian opens directly: a BOM for the diacritics, `;` between
 * cells, CRLF after every line, RFC 4180 quotes. A text cell starting with = + - or @ gets a
 * leading ' so Excel never runs it as a formula; so does one starting with a tab or a carriage return.
 */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  return '﻿' + [header, ...rows].map((row) => row.map(cell).join(';') + '\r\n').join('');
}

/** 8.5 → "8,50"; null stays no value. */
export function csvDecimal(value: number | null): string | null {
  return value === null ? null : value.toFixed(2).replace('.', ',');
}

function cell(value: CsvCell): string {
  if (value === null) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'da' : 'nu';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
