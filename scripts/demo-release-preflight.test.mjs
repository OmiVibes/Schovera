import { describe, expect, it } from 'vitest';
import { validateDemoReleasePlan } from './demo-release-preflight.mjs';
const plan = { appUrl: 'https://fictional-school-demo.vercel.app', supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co', demoProjectRef: 'abcdefghijklmnopqrst', productionProjectRef: 'uvwxyzabcdefghijklmn' };
describe('non-mutating demo release preflight', () => {
  it('validates a separate plan without authorizing deployment or seeding', () => {
    expect(validateDemoReleasePlan(plan)).toMatchObject({planValid:true,deploymentAuthorized:false,hostedSeedingAuthorized:false,deviceIngestion:'disabled'});
  });
  it.each([
    {appUrl:'https://schovera.vercel.app'}, {appUrl:'http://demo.vercel.app'},
    {supabaseUrl:'https://uvwxyzabcdefghijklmn.supabase.co'}, {productionProjectRef:plan.demoProjectRef},
    {supabaseUrl:'https://user:password@abcdefghijklmnopqrst.supabase.co'}, {appUrl:'https://demo.vercel.app/?token=x'},
    {demoProjectRef:'PLACEHOLDER'},
    {appUrl:'https://fictional-school-demo.vercel.app:8443'}, {supabaseUrl:'https://abcdefghijklmnopqrst.supabase.co:8443'},
  ])('refuses unsafe or unverified plan %j', override => expect(()=>validateDemoReleasePlan({...plan,...override})).toThrow());
});
