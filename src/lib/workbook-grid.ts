export const WORKBOOK_LIMITS = { bytes: 5 * 1024 * 1024, rows: 200, columns: 30, cellCharacters: 500 } as const;

export function prepareWorkbookGrid(value: unknown[][], dimensions?: { rows: number; columns: number }) {
  const visible = value.slice(0, WORKBOOK_LIMITS.rows);
  const width = Math.min(WORKBOOK_LIMITS.columns, Math.max(1, ...visible.map(row => row.length)));
  const limited = value.length > WORKBOOK_LIMITS.rows || (dimensions?.rows ?? 0) > WORKBOOK_LIMITS.rows
    || (dimensions?.columns ?? 0) > WORKBOOK_LIMITS.columns
    || value.some(row => row.length > WORKBOOK_LIMITS.columns || row.some(cell => String(cell ?? '').length > WORKBOOK_LIMITS.cellCharacters));
  return { limited, rows: visible.map(row => Array.from({ length: width }, (_, index) => String(row[index] ?? '').slice(0, WORKBOOK_LIMITS.cellCharacters))) };
}
