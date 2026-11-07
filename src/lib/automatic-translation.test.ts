import {describe,it,expect} from 'vitest';
import {validateTranslationFacts,translationUsesTargetScript} from './automatic-translation';
const source={title:'Parent meeting',body:'Meet on 7 November 2026 at 9 AM.'};
const result={title:'학부모 모임',body:'2026년 11월 7일 오전 9시에 모입니다.'};
describe('automatic translation critical-fact checks',()=>{
  it('accepts equivalent Korean date order without altering original text',()=>{expect(()=>validateTranslationFacts(source,result,'ko')).not.toThrow();expect(source.body).toContain('7 November');});
  it.each([
    ['wrong month','2026년 7월 7일 오전 9시에 모입니다.'],
    ['wrong day','2026년 11월 9일 오전 7시에 모입니다.'],
    ['wrong year','2027년 11월 7일 오전 9시에 모입니다.'],
    ['wrong time','2026년 11월 7일 오전 10시에 모입니다.'],
    ['wrong meridiem','2026년 11월 7일 오후 9시에 모입니다.'],
    ['invented amount','2026년 11월 7일 오전 9시에 모입니다. 100'],
  ])('refuses %s',(_,body)=>expect(()=>validateTranslationFacts(source,{title:result.title,body},'ko')).toThrow());
  it('allows Marathi digit forms and rejects a changed fee',()=>{
    const s={title:'Notice',body:'Fee 20 on 7 November 2026.'};
    expect(()=>validateTranslationFacts(s,{title:'सूचना',body:'७ नोव्हेंबर २०२६ रोजी शुल्क २०.'},'mr')).not.toThrow();
    expect(()=>validateTranslationFacts(s,{title:'सूचना',body:'७ नोव्हेंबर २०२६ रोजी शुल्क ३०.'},'mr')).toThrow();
  });
  it('allows omission of zero minutes, and does not confuse ordinary may with a month',()=>{
    expect(()=>validateTranslationFacts({title:'Notice',body:'We may meet at 09:00 AM.'},{title:'안내',body:'오전 9시에 모일 수 있습니다.'},'ko')).not.toThrow();
  });
  it('rejects substantially English output for Korean or Marathi',()=>{
    expect(translationUsesTargetScript(result.body,'ko')).toBe(true);
    expect(translationUsesTargetScript('The meeting is tomorrow. 학교','ko')).toBe(false);
    expect(translationUsesTargetScript('पालकांची बैठक आहे.','mr')).toBe(true);
    expect(translationUsesTargetScript('Bring your book.','mr')).toBe(false);
  });
});
