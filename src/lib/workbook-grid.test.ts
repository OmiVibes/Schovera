import { expect, it } from 'vitest';
import { prepareWorkbookGrid } from './workbook-grid';

it('preserves ordinary cell values and fills missing cells without mutating input', () => {
  const input = [['Subject', 'Score'], ['Maths', 10], [null]];
  const result = prepareWorkbookGrid(input);
  expect(result).toEqual({ limited: false, rows: [['Subject', 'Score'], ['Maths', '10'], ['', '']] });
  expect(input[2]).toEqual([null]);
});
it('reports truncation instead of silently discarding long cells', () => {
  const result = prepareWorkbookGrid([['a'.repeat(501)]]);
  expect(result.limited).toBe(true); expect(result.rows[0][0]).toHaveLength(500);
});
it('bounds rows and columns and reports content outside the visible grid', () => {
  const result = prepareWorkbookGrid(Array.from({ length: 201 }, () => Array(31).fill('x')));
  expect(result.limited).toBe(true); expect(result.rows).toHaveLength(200); expect(result.rows[0]).toHaveLength(30);
});
it('uses the full worksheet range when the parser has already bounded the rows', () => {
  expect(prepareWorkbookGrid([['visible']], { rows: 300, columns: 2 }).limited).toBe(true);
});
it('preserves blank row positions in the editable grid', () => {
  expect(prepareWorkbookGrid([['Header'], [], ['Value']]).rows).toEqual([['Header'], [''], ['Value']]);
});
