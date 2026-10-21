import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function readPresentationSource(source) {
  const root=path.resolve(source);
  if(existsSync(path.join(root,'.env.local')))throw new Error('Source must exclude production environment files; file not opened');
  const directory=path.join(root,'.local/schovera-manual-demo');
  const pointer=JSON.parse(readFileSync(path.join(directory,'current.json'),'utf8'));
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pointer.runId ?? ''))throw new Error('Invalid owned run pointer');
  const manifest=JSON.parse(readFileSync(path.join(directory,pointer.runId,'manifest.json'),'utf8'));
  if(manifest.runId!==pointer.runId || manifest.presentation?.ready!==true || manifest.presentation?.fictional!==true || manifest.students?.length!==20)throw new Error('Completed fictional presentation manifest required');
  return manifest;
}
