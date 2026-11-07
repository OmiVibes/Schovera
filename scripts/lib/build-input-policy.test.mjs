import { expect, it } from 'vitest';
import { workingBuildInput, regularBuildSource } from './build-input-policy.mjs';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
it('allows app code and required lockfile/configuration, including new source files', () => {
  for (const file of ['package-lock.json', 'next.config.ts', 'src/components/new.tsx', 'scripts/new.test.ts']) expect(workingBuildInput(file)).toBe(true);
  expect(workingBuildInput('public/logo.png', true)).toBe(true);
  for (const file of ['public/uploads/family.png', 'public/credentials.json', 'public/school-data.json']) expect(workingBuildInput(file, true)).toBe(false);
});
it('refuses linked directories and escaping paths before opening source files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'schovera-build-policy-'));
  try {
    await mkdir(path.join(root, 'owned'));
    await writeFile(path.join(root, 'owned', 'code.ts'), 'export {};');
    await symlink(path.join(root, 'owned'), path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(regularBuildSource(root, 'linked/code.ts')).rejects.toThrow('Linked');
    await expect(regularBuildSource(root, '../outside.ts')).rejects.toThrow('escapes');
    await expect(regularBuildSource(root, 'owned')).rejects.toThrow('Non-regular');
    expect(await regularBuildSource(root, 'owned/code.ts')).toBe(path.join(root, 'owned', 'code.ts'));
  } finally {
    // Only the exact directory returned by mkdtemp is owned by this test.
    await rm(root, { recursive: true, force: true });
  }
});
it('refuses private files, developer artifacts, databases, traversal and untracked media', () => {
  for (const file of ['.env.local', 'src/.env.production', 'src/secret.pem', '.local/users.json', 'review/private.md', 'AGENTS.md', 'CLAUDE.md', 'local-dev.out', 'src/../secret.ts', 'D:/secret.ts', 'src\\secret.ts', 'src/uploads/users.json', 'docs/private.md', 'public/family.png']) expect(workingBuildInput(file)).toBe(false);
});
