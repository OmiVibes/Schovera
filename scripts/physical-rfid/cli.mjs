// Stage 1 has no hardware/listen command and no production/backend imports.
import { pathToFileURL } from 'node:url';
import { PhysicalRfidAdapter } from './adapter.mjs';

export async function simulate(report = value => console.log(JSON.stringify(value))) {
  const writes = []; const adapter = new PhysicalRfidAdapter({ write: async line => { writes.push(line); }, report });
  adapter.connect(); adapter.feed(Buffer.from('SRFID,1,READY\n'));
  const binding = await adapter.bindSession();
  adapter.feed(Buffer.from(`SRFID,1,STATE,${binding.sessionId},0\n`));
  // Fictional bytes only. This is not the owner's real card.
  const first = `SRFID,1,SCAN,${binding.sessionId},1,A1:B2:C3:D4,100\n`;
  adapter.feed(Buffer.from(first.slice(0, 17))); adapter.feed(Buffer.from(first.slice(17)));
  await adapter.flushValidationAcks();
  adapter.feed(Buffer.from(first)); await adapter.flushValidationAcks();
  adapter.disconnect(); adapter.connect();
  adapter.feed(Buffer.from(`SRFID,1,STATE,${binding.sessionId},1\n`));
  adapter.feed(Buffer.from(`SRFID,1,SCAN,${binding.sessionId},2,A1:B2:C3:D4,2200\n`));
  await adapter.flushValidationAcks(); adapter.disconnect();
  report({ code: 'simulation_complete', ...adapter.inspect(), writeCount: writes.length });
  return adapter.inspect();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || process.argv[2] !== 'simulate') {
    console.error('Stage 1 supports only: node scripts/physical-rfid/cli.mjs simulate'); process.exitCode = 2;
  } else await simulate();
}
