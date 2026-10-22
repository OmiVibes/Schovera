// No dotenv discovery. Secrets supplied only via the operator's controlled
// process environment, never arguments or configuration committed to Git.
import { existsSync, readFileSync } from 'node:fs';
import { DemoAdapter } from './adapter.mjs';

try {
  if (existsSync('.env.local'))
    throw new Error(
      'Use an isolated operator checkout; private env was not opened',
    );
  const args = process.argv.slice(2),
    operation = args.shift() ?? 'prepare',
    options = {};
  while (args.length) {
    const key = args.shift(),
      value = args.shift();
    if (
      ![
        '--approval',
        '--dataset',
        '--run',
        '--expires',
        '--account',
        '--confirm',
      ].includes(key) ||
      !value ||
      options[key]
    )
      throw new Error('Invalid operator option');
    options[key] = value;
  }
  if (!options['--approval'] || !options['--dataset'])
    throw new Error('Explicit approval and fictional dataset files required');
  const adapter = new DemoAdapter({
    approval: JSON.parse(readFileSync(options['--approval'], 'utf8')),
    credentials: {
      url: process.env.SCHOVERA_PROVISION_URL,
      key: process.env.SCHOVERA_PROVISION_SECRET,
      publishableKey: process.env.SCHOVERA_PROVISION_PUBLIC,
    },
    directory: '.local/schovera-hosted-demo',
  });
  const result = await adapter.run(
    JSON.parse(readFileSync(options['--dataset'], 'utf8')),
    {
      operation,
      runId: options['--run'],
      expiresAt: options['--expires'],
      account: options['--account'],
      confirm: options['--confirm'],
    },
  );
  console.log(JSON.stringify(result, null, 2));
} catch {
  console.error(
    'Demo operation refused or failed. Check pinned identity, exact run ownership and private journal stage. No secret details logged.',
  );
  process.exitCode = 1;
}
