import path from 'node:path';
import { lstat } from 'node:fs/promises';
const roots = new Set(['package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts', 'next.config.mjs', 'postcss.config.mjs', 'eslint.config.mjs', 'vitest.config.ts']);
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.svg']);
export function workingBuildInput(file, tracked = false) {
  if (!file || file.includes('\\') || file.includes(':') || file.startsWith('/') || file.split('/').some(p => !p || p === '..' || p.startsWith('.'))) return false;
  if (file.split('/').some(p => ['node_modules', 'uploads', 'storage', 'review', 'coverage', 'credentials.json'].includes(p.toLowerCase()))) return false;
  if (roots.has(file)) return true;
  if (tracked && file.startsWith('public/')) return /\.(?:svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf)$/i.test(file);
  return /^(?:src|scripts)\//.test(file) && extensions.has(path.posix.extname(file).toLowerCase()) && !file.split('/').some(p => ['node_modules', 'uploads', 'storage', 'review', 'coverage'].includes(p.toLowerCase()));
}
export async function regularBuildSource(root, file) {
  const base = path.resolve(root); const target = path.resolve(base, file);
  if (!target.startsWith(`${base}${path.sep}`)) throw new Error('Build input escapes source root');
  let current = base;
  for (const part of path.relative(base, target).split(path.sep)) {
    current = path.join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error('Linked build inputs are refused');
    if (current === target && !info.isFile()) throw new Error('Non-regular build input');
  }
  return target;
}
