import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ParentFallbackPreferences } from './fallback-simulator';
const state=vi.hoisted(()=>({language:'en'}));
vi.mock('@/lib/i18n-provider',()=>({useI18n:()=>({language:state.language,t:(key:string)=>key})}));
afterEach(()=>vi.unstubAllEnvs());
it.each(['en','hi','mr'])('shows an honest non-interactive hosted example in %s',language=>{
  state.language=language;vi.stubEnv('NEXT_PUBLIC_SCHOVERA_HOSTED_DEMO','true');
  const html=renderToStaticMarkup(<ParentFallbackPreferences/>);
  expect(html).toContain('hosted-fallback-example');expect(html).toContain('SMS');expect(html).toContain('IVR');
  expect(html).not.toContain('<button');expect(html).not.toContain('<input');expect(html).not.toContain('receipt_ref');
});
