import {expect,it} from 'vitest';
import {schoolDisplayName,academicYearDisplayName} from './school-brand';
it('removes the old fixture suffix without renaming real institutions',()=>{
  expect(schoolDisplayName('Schovera Model School — Demo Campus')).toBe('Schovera Model School');
  expect(schoolDisplayName('Demo Academy')).toBe('Demo Academy');
});
it('cleans only the known year-label shape and leaves query values unchanged',()=>{
  const stored='2026–27 Demo';expect(academicYearDisplayName(stored)).toBe('2026–27');expect(stored).toBe('2026–27 Demo');
  expect(academicYearDisplayName('Summer Demo')).toBe('Summer Demo');
  expect(academicYearDisplayName('2026–27')).toBe('2026–27');
});
