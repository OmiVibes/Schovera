import { extraUiRows } from './ui-copy-extra.mjs';
import type { Language } from './i18n';
const reused: Record<string, readonly [string, string]> = {"Manage users":["उपयोगकर्ता प्रबंधन","वापरकर्ते व्यवस्थापन"],"Loading…":["लोड हो रहा है…","लोड होत आहे…"],"Parent":["अभिभावक","पालक"],"Teacher":["शिक्षक","शिक्षक"],"Principal":["प्रधानाचार्य","मुख्याध्यापक"],"School notices":["स्कूल सूचनाएँ","शाळेच्या सूचना"],"Attendance":["उपस्थिति","उपस्थिती"],"Homework":["गृहकार्य","गृहपाठ"],"Timetable":["समय-सारणी","वेळापत्रक"],"Students":["विद्यार्थी","विद्यार्थी"],"Communication":["संचार","संवाद"],"Present":["उपस्थित","उपस्थित"],"Absent":["अनुपस्थित","अनुपस्थित"],"Late":["देर से","उशिरा"],"Important":["महत्वपूर्ण","महत्त्वाचे"],"Acknowledged":["पुष्टि की गई","पुष्टी केली"],"Awaiting acknowledgement":["पुष्टि की प्रतीक्षा","पुष्टीची प्रतीक्षा"],"Acknowledgement requested":["पुष्टि आवश्यक","पुष्टी आवश्यक"],"Acknowledge update: {0}":["अपडेट की पुष्टि करें: {0}","अपडेटची पुष्टी करा: {0}"],"Correction":["सुधार","दुरुस्ती"],"Corrected":["सुधारा गया","दुरुस्त केले"],"Corrects: {0}":["इसका सुधार: {0}","याची दुरुस्ती: {0}"],"This update was corrected by a newer communication.":["इस अपडेट को एक नए संदेश से सुधारा गया है।","हा अपडेट नव्या संदेशाने दुरुस्त केला आहे."],"Replaced by a newer correction":["नए सुधार से बदला गया","नव्या दुरुस्तीने बदलले"],"Class":["कक्षा","वर्ग"],"Latest update":["नवीनतम अपडेट","नवीनतम अपडेट"],"Up to date":["सब अपडेटेड है","सर्व अपडेट झाले आहे"],"Latest: {0} · {1}":["हाल की स्थिति: {0} · {1}","अलीकडील स्थिती: {0} · {1}"],"Subject":["विषय","विषय"],"CLASS SCHEDULE":["कक्षा की समय-सारणी","वर्गाचे वेळापत्रक"],"Select a class to view its timetable":["समय-सारणी देखने के लिए कक्षा चुनें","वेळापत्रक पाहण्यासाठी इयत्ता निवडा"],"Today":["आज","आज"],"Weekly timetable":["साप्ताहिक समय-सारणी","साप्ताहिक वेळापत्रक"],"All school days":["स्कूल के सभी दिन","शाळेचे सर्व दिवस"],"No classes scheduled for today.":["आज कोई कक्षा निर्धारित नहीं है।","आज कोणताही वर्ग नियोजित नाही."],"The weekly timetable remains available below.":["साप्ताहिक समय-सारणी नीचे उपलब्ध है।","साप्ताहिक वेळापत्रक खाली उपलब्ध आहे."],"No periods":["कोई कक्षा नहीं","वर्ग नाहीत"],"School-wide notice":["पूरे स्कूल के लिए सूचना","संपूर्ण शाळेसाठी सूचना"],"Published {0}":["{0} को प्रकाशित","{0} रोजी प्रकाशित"],"Loading attendance":["उपस्थिति लोड हो रही है","उपस्थिती लोड होत आहे"],"Loading homework":["गृहकार्य लोड हो रहा है","गृहपाठ लोड होत आहे"],"Loading timetable":["समय-सारणी लोड हो रही है","वेळापत्रक लोड होत आहे"],"Loading school notices":["स्कूल सूचनाएँ लोड हो रही हैं","शाळेच्या सूचना लोड होत आहेत"],"Grade {0}{1}":["कक्षा {0}{1}","इयत्ता {0}{1}"]};
export const uiCopy: Record<string, readonly [string, string]> = { ...reused };
for (const row of extraUiRows.trim().split('\n')) {
  const parts = row.split('|');
  if (parts.length !== 3) throw new Error('Invalid interface dictionary row');
  uiCopy[parts[0]] = [parts[1], parts[2]];
}
for (const role of ['Parent', 'Teacher', 'Principal']) uiCopy[role.toLowerCase()] = uiCopy[role];
const templates = Object.keys(uiCopy).filter(key => /\{\d+\}/.test(key)).map(key => ({ key, parts: key.split(/\{\d+\}/) }));
function capture(source: string, parts: string[]) {
  if (!source.startsWith(parts[0]) || parts.slice(1, -1).some(p => !p)) return null;
  let position = parts[0].length; const values: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    const delimiter = parts[i];
    const end = i === parts.length - 1 ? source.length - delimiter.length : source.indexOf(delimiter, position);
    if (end < position || source.slice(end, end + delimiter.length) !== delimiter) return null;
    values.push(source.slice(position, end)); position = end + delimiter.length;
  }
  return position === source.length ? values : null;
}
export function uiText(source: unknown, language: Language, values: readonly unknown[] = []): string {
  const original = String(source ?? ''); const key = original.trim();
  if (!key) return original;
  let matchedKey = key;
  let entry = uiCopy[key]; let args = values;
  if (!entry && language !== 'en' && key.length <= 2000) {
    for (const template of templates) {
      const captured = capture(key, template.parts);
      if (captured) { entry = uiCopy[template.key]; matchedKey = template.key; args = captured; break; }
    }
  }
  const template = language === 'en' || !entry ? key : entry[language === 'hi' ? 0 : 1];
  if (language !== 'en' && matchedKey === 'Account created for {0}. {1}') args = [args[0], uiText(args[1], language)];
  const rendered = template.replace(/\{(\d+)\}/g, (token, index: string) => args[Number(index)] === undefined ? token : String(args[Number(index)]));
  return (original.match(/^\s*/)?.[0] ?? '') + rendered + (original.match(/\s*$/)?.[0] ?? '');
}
