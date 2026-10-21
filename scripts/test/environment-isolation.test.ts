import { expect, it } from 'vitest';
import { resolveConfig } from 'vite';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import projectConfig from '../../vitest.config';

it('disables Vite dotenv discovery; synthetic control proves the default would load it', async () => {
  const root=mkdtempSync(path.join(tmpdir(),'schovera-dotenv-proof-'));
  try {
    writeFileSync(path.join(root,'.env.local'),'VITE_SCHOVERA_SYNTHETIC_PRIVATE_PROBE=harmless_test_sentinel');
    expect(projectConfig.envDir).toBe(false);
    const isolated=await resolveConfig({root,configFile:false,envDir:projectConfig.envDir},'serve','test');
    expect(isolated.env.VITE_SCHOVERA_SYNTHETIC_PRIVATE_PROBE).toBeUndefined();
    const control=await resolveConfig({root,configFile:false,envDir:root},'serve','test');
    expect(control.env.VITE_SCHOVERA_SYNTHETIC_PRIVATE_PROBE).toBe('harmless_test_sentinel');
  } finally {rmSync(root,{recursive:true,force:true});}
});
