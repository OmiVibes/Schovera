export type ReadingLanguage = 'en' | 'hi' | 'mr' | 'ko';
export const readingLanguages = [
  { code:'en', label:'English' }, { code:'hi', label:'हिन्दी' },
  { code:'mr', label:'मराठी' }, { code:'ko', label:'한국어' },
] as const;
export type AutomaticTranslation = { title: string; body: string; language: ReadingLanguage; method: 'automatic' | 'original' };
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const translatedMonths = {
  hi:['जनवरी','फ़रवरी','मार्च','अप्रैल','मई','जून','जुलाई','अगस्त','सितंबर','अक्टूबर','नवंबर','दिसंबर'],
  mr:['जानेवारी','फेब्रुवारी','मार्च','एप्रिल','मे','जून','जुलै','ऑगस्ट','सप्टेंबर','ऑक्टोबर','नोव्हेंबर','डिसेंबर'],
  ko:months.map((_,i)=>`${i+1}월`), en:months,
};
export function validateTranslationFacts(source:{title:string;body:string}, result:{title:string;body:string}, language:ReadingLanguage) {
  const normalize=(text:string)=>text.replace(/[०-९]/gu,c=>String(c.charCodeAt(0)-0x966));
  const numbers=(text:string)=>(normalize(text).match(/\d+/g)??[]).map(n=>n.length<=2?String(Number(n)):n).sort();
  for(const field of ['title','body'] as const){
    const original=normalize(source[field]), translated=normalize(result[field]);
    const expected=numbers(original);
    for(const match of original.matchAll(new RegExp(`\\b(${months.join('|')})\\b`,'gi'))){
      if(match[0]==='may'&&!/\d\s*$/.test(original.slice(0,match.index)))continue;
      const month=months.findIndex(m=>m.toLowerCase()===match[0].toLowerCase());
      const word=translatedMonths[language][month];
      if(!translated.includes(word)&&!(language==='hi'&&month===10&&translated.includes('नवम्बर')))throw new Error('MONTH_CHANGED');
      if(language==='ko')expected.push(String(month+1));
      const before=original.slice(0,match.index).match(/(\d{1,2})\s*$/)?.[1];
      if(before&&language==='ko'&&!new RegExp(`${month+1}월\\s*${Number(before)}일`).test(translated))throw new Error('DATE_CHANGED');
    }
    const actual=numbers(translated);
    // An omitted zero-minute suffix (09:00 -> 9시) changes formatting, not time.
    for(let i=0;i<(original.match(/:00\b/g)??[]).length&&expected.length>actual.length;i++){const zero=expected.indexOf('0');if(zero>=0)expected.splice(zero,1);}
    if(JSON.stringify(expected.sort())!==JSON.stringify(actual))throw new Error('NUMBERS_CHANGED');
    if(/\d\s*AM\b/i.test(original)&&language==='ko'&&!translated.includes('오전'))throw new Error('TIME_CHANGED');
    if(/\d\s*PM\b/i.test(original)&&language==='ko'&&!translated.includes('오후'))throw new Error('TIME_CHANGED');
  }
}
export function translationUsesTargetScript(text: string, language: ReadingLanguage) {
  const letters = [...text].filter(char=>/\p{L}/u.test(char));
  const script = language === 'ko' ? /[\u1100-\u11ff\uac00-\ud7a3]/u : language === 'hi' || language === 'mr' ? /[\u0900-\u097f]/u : /[A-Za-z]/u;
  return letters.length > 0 && letters.filter(char=>script.test(char)).length / letters.length >= .5;
}
