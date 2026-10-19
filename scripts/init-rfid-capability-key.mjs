import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const directory = join(process.cwd(), '.local', 'schovera-rfid-gateway');
const privatePath = join(directory, 'capability-issuer.private.pem');
const idPath = join(directory, 'capability-issuer.key-id');
await mkdir(directory, { recursive: true });
for (const path of [privatePath, idPath]) {
  try { await readFile(path); throw new Error('A local capability key already exists; refusing to overwrite it.'); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const privateHandle = await open(privatePath, 'wx', 0o600);
try { await privateHandle.writeFile(privateKey.export({ type: 'pkcs8', format: 'pem' })); } finally { await privateHandle.close(); }
try {
  await writeFile(idPath, `local-${randomUUID()}\n`, { flag: 'wx', mode: 0o600 });
} catch (error) {
  // Remove only the private key created by this invocation if the paired ID write failed.
  const { unlink } = await import('node:fs/promises');
  await unlink(privatePath).catch(() => {});
  throw error;
}
console.log(`Created a local-only synthetic capability issuer key. Private key: ${privatePath} (never share or commit).`);
console.log(`Public key (register using an authenticated same-school Principal account):\n${publicKey.export({ type: 'spki', format: 'pem' }).toString()}`);
