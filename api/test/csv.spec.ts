import { csvDecimal, toCsv } from '../src/grades/csv';

const BOM = '﻿';

describe('CSV for Excel set to Romanian (D-029)', () => {
  it('starts with a BOM, separates with ; and ends each line with CRLF', () => {
    expect(toCsv(['Echipa', 'Nota'], [['Echipa 1', '8,50']])).toBe(`${BOM}Echipa;Nota\r\nEchipa 1;8,50\r\n`);
  });

  it('writes yes/no as da/nu, integers as they are and no value as an empty cell', () => {
    expect(toCsv(['a', 'b', 'c', 'd'], [[true, false, 3, null]])).toBe(`${BOM}a;b;c;d\r\nda;nu;3;\r\n`);
  });

  it('quotes a cell with ;, a quote or a line break, doubling the quotes', () => {
    expect(toCsv(['x'], [['Echipa; A'], ['Spune "da"'], ['două\nrânduri']])).toBe(
      `${BOM}x\r\n"Echipa; A"\r\n"Spune ""da"""\r\n"două\nrânduri"\r\n`,
    );
  });

  it("puts ' before a text cell starting with = + - or @, so Excel reads it as text", () => {
    expect(toCsv(['x'], [['=1+1'], ['+40'], ['-2'], ['@SUM(A1)'], ['Echipa = 1']])).toBe(
      `${BOM}x\r\n'=1+1\r\n'+40\r\n'-2\r\n'@SUM(A1)\r\nEchipa = 1\r\n`,
    );
  });

  it('formats a decimal with a comma and 2 decimals, and null as no value', () => {
    expect(csvDecimal(8.5)).toBe('8,50');
    expect(csvDecimal(1)).toBe('1,00');
    expect(csvDecimal(0.85)).toBe('0,85');
    expect(csvDecimal(null)).toBeNull();
  });
});

describe('CSV formula guard for tab and carriage return (D-029, code review)', () => {
  it("puts ' before a cell starting with a tab or a carriage return", () => {
    expect(toCsv(['x'], [['\t=1+1']])).toBe(`${BOM}x\r\n'\t=1+1\r\n`);
    expect(toCsv(['x'], [['\r=1+1']])).toBe(`${BOM}x\r\n"'\r=1+1"\r\n`);
  });
});
