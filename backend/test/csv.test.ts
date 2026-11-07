import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '../utils/csv';

// Subscriber export (spec 2026-11-07): opens in Excel with Vietnamese intact, and a cell can never
// run as a formula when the file is opened (CSV injection).
describe('csvCell', () => {
  it('quotes every cell and doubles inner quotes', () => {
    expect(csvCell('an@example.com')).toBe('"an@example.com"');
    expect(csvCell('a"b')).toBe('"a""b"');
  });

  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])('neutralises %j', (value) => {
    expect(csvCell(value)).toBe(`"'${value}"`);
  });
});

describe('toCsv', () => {
  it('starts with a UTF-8 BOM and uses CRLF lines', () => {
    expect(toCsv(['email'], [['an@example.com']])).toBe('﻿"email"\r\n"an@example.com"\r\n');
  });
});
