import { describe, expect, it } from 'vitest';
import { classDisplay, compareClasses } from './class-display';
import { uiText } from './ui-copy';

describe('class presentation keeps stored identity separate', () => {
  it('separates grade and section without inventing enrollment', () => {
    expect(classDisplay({ grade: '7', division: 'A' })).toBe('Grade 7-A');
    expect(classDisplay({ grade: '6', division: 'B' })).toBe('Grade 6-B');
    expect(classDisplay({ grade: '9', division: 'R1a' })).toBe('Grade 9-R1a');
    expect(classDisplay({ grade: '7', division: '' })).toBe('Grade 7');
    expect(classDisplay(null)).toBe('Class');
  });
  it('localizes the interface prefix while preserving authored section names', () => {
    expect(classDisplay({grade:'7',division:'A'}, (s,v)=>uiText(s,'hi',v))).toBe('कक्षा 7-A');
    expect(classDisplay({grade:'7',division:'A'}, (s,v)=>uiText(s,'mr',v))).toBe('इयत्ता 7-A');
  });
  it('sorts grades and sections naturally', () => {
    const rows=[{grade:'10',division:'B'},{grade:'7',division:'C'},{grade:'7',division:'A'}];
    expect(rows.sort(compareClasses).map(v=>classDisplay(v))).toEqual(['Grade 7-A','Grade 7-C','Grade 10-B']);
  });
});
