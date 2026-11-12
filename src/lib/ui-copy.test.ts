import { expect, it } from 'vitest';
import { uiCopy, uiText } from './ui-copy';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
it('preserves translated scripts and rejects encoding replacement text', () => {
  for (const [source, values] of Object.entries(uiCopy)) {
    for (const value of values) expect(value, source).not.toMatch(/\?{2,}|\uFFFD/);
  }
  for (const language of ['hi', 'mr'] as const) {
    expect(uiText('Attendance register students', language)).toMatch(/[\u0900-\u097f]/);
  }
});
it('provides Hindi/Marathi interface copy with every placeholder retained', () => {
  for (const [source, values] of Object.entries(uiCopy)) for (const value of values) {
    expect(value.length > 0 || source === 's', source).toBe(true);
    expect([...value.matchAll(/\{\d+\}/g)].map(m => m[0]).sort(), source).toEqual([...source.matchAll(/\{\d+\}/g)].map(m => m[0]).sort());
  }
});
it('preserves data values, zero counts, punctuation and the English default', () => {
  expect(uiText(' {0} students ', 'hi', [0])).toBe(' 0 विद्यार्थी ');
  expect(uiText('Welcome, {0}.', 'mr', ['Arohi'])).toContain('Arohi');
  expect(uiText('Parent-authored original <b>text</b>', 'hi')).toBe('Parent-authored original <b>text</b>');
  expect(uiText(' Grade ', 'en')).toBe(' Grade ');
  expect(uiText('Grade 7A', 'hi')).toBe('कक्षा 7A');
  expect(uiText('Grade 7A', 'mr')).toBe('इयत्ता 7A');
  expect(uiText('Row {0}, column {1}', 'mr', [2, 3])).toBe('ओळ 2, स्तंभ 3');
  expect(uiText('Row {0}, column {1}', 'mr')).toContain('{0}');
});
it('localizes known dynamic interface notices without translating unknown communication', () => {
  expect(uiText('Account created for example@school.test. Keep this password.', 'hi')).toContain('example@school.test');
  expect(uiText('Account created for example@school.test. Keep this password.', 'hi')).toContain('खाता');
  expect(uiText('A fictional original message', 'mr')).toBe('A fictional original message');
});
it('has a dictionary entry for every statically marked interface string', () => {
  for (const file of ['schovera-app.tsx', 'manage-users.tsx', 'teacher-ai-workspace.tsx', 'assignment-editor.tsx']) {
    const source = readFileSync(`src/components/${file}`, 'utf8'); const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 'ui' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) expect(uiCopy[node.arguments[0].text.trim()], node.arguments[0].text).toBeDefined();
      if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'source' && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression && ts.isStringLiteral(node.initializer.expression)) expect(uiCopy[node.initializer.expression.text.trim()], node.initializer.expression.text).toBeDefined();
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
});
