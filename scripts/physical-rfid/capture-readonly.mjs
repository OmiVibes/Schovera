// No dotenv, backend, SQLite, enrollment, firmware or synthetic bridge imports.
import { pathToFileURL } from 'node:url';
import { ReadOnlyObserver } from './capture-observer.mjs';
import { ReadOnlyWindowsTransport, validateReadOnlyOptions } from './readonly-windows.mjs';
import { ReadOnlyLinuxTransport, validateLinuxOptions } from './readonly-linux.mjs';

export function parseCaptureArgs(args) {
  const values = {}; const flags = new Set(['--ack-reset-risk', '--confirm-monitor-closed']);
  const parameters = new Set(['--port', '--confirm-pnp-id', '--seconds', '--dtr']);
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key in values || (!flags.has(key) && !parameters.has(key))) throw Error('invalid_readonly_arguments');
    if (flags.has(key)) values[key] = true;
    else { if (i + 1 >= args.length) throw Error('invalid_readonly_arguments'); values[key] = args[++i]; }
  }
  if (!/^(?:[1-9]|[12][0-9]|30)$/.test(values['--seconds'] ?? '')) throw Error('invalid_readonly_duration');
  return validateReadOnlyOptions({ port: values['--port'], pnpId: values['--confirm-pnp-id'], seconds: Number(values['--seconds']),
    dtr: values['--dtr'], resetRiskAccepted: values['--ack-reset-risk'], monitorClosedConfirmed: values['--confirm-monitor-closed'] });
}

export async function runReadOnlyCapture(options, { createTransport, report = value => console.log(JSON.stringify(value)),
  signal, processSignals = process, now = () => performance.now() } = {}) {
  const linux = options?.platform === 'linux';
  const config = linux ? validateLinuxOptions(options) : validateReadOnlyOptions(options);
  if (signal?.aborted) return { reason: 'cancelled_before_open', portOpened: false, serialPayloadWrites: 0, backendWritten: false, exitCode: 1 };
  const transport = createTransport ? createTransport(config) : linux ? new ReadOnlyLinuxTransport(config) : new ReadOnlyWindowsTransport(config);
  const source = createTransport ? 'mock_serial' : linux ? 'linux_serial_readonly' : 'windows_serial_readonly';
  return new Promise(resolve => {
    const startedAt = now(); let captureStartedAt = null, closing = false, finished = false, opened = false, reason = '', failure = false;
    let softTimer, hardTimer, startupTimer, closeGuard;
    const diagnostic = value => {
      try { report({ ...value, source, serialPayloadWrites: 0, backendWritten: false }); }
      catch { stop('reporting_failure', true); }
    };
    const observer = new ReadOnlyObserver({ now, report: diagnostic, stop: code => stop(code, true) });
    const finish = evidence => {
      if (finished) return;
      finished = true; observer.end();
      for (const timer of [softTimer, hardTimer, startupTimer, closeGuard]) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort); processSignals.removeListener('SIGINT', onSigint); processSignals.removeListener('SIGTERM', onSigterm);
      for (const [name, fn] of listeners) transport.removeListener(name, fn);
      const closure = evidence?.exited === true ? evidence.workerConfirmed ? 'worker_closed_and_exited' : 'worker_exit_observed' : 'unconfirmed';
      const result = { code: 'readonly_capture_finished', source, port: config.port, baud: 115200, dtr: config.dtr, rts: 'off',
        resetRiskAcknowledged: true, monitorClosedOperatorConfirmed: true, reason, portOpened: opened,
        elapsedMs: Math.round(Math.max(0, now() - startedAt)),
        captureElapsedMs: captureStartedAt === null ? 0 : Math.round(Math.max(0, now() - captureStartedAt)),
        closureEvidence: closure, ...observer.snapshot(),
        exitCode: reason === 'sigint' ? 130 : reason === 'sigterm' ? 143 : failure || !opened || closure === 'unconfirmed' ? 1 : 0 };
      try { report(result); } catch { result.exitCode = 1; }
      resolve(result);
    };
    const stop = (code, failed = false) => {
      if (closing || finished) return;
      closing = true; reason = code; failure = failed; observer.end(); clearTimeout(softTimer); clearTimeout(startupTimer);
      closeGuard = setTimeout(() => { transport.forceKill(); finish({ exited: false }); }, 500);
      try { Promise.resolve(transport.close()).then(finish, () => { transport.forceKill(); finish({ exited: false }); }); }
      catch { transport.forceKill(); finish({ exited: false }); }
    };
    const abortReason = () => {
      const requested = signal?.reason;
      return requested === 'capture_budget_reached' || requested === 'capture_held_or_failed'
        ? requested : 'cancelled';
    };
    const onSigint = () => stop('sigint');
    const onSigterm = () => stop('sigterm');
    const onAbort = () => {
      const code = abortReason();
      stop(code, code !== 'capture_budget_reached');
    };
    const onOpened = () => {
      if (!closing && !opened) {
        opened = true; clearTimeout(startupTimer);
        captureStartedAt = now();
        // The capture budget begins only after exact port-open confirmation.
        // Emit readiness first so supervised operators receive the full window
        // after the TAP prompt; the deadline is armed immediately afterward.
        diagnostic({ code: 'readonly_port_opened', port: config.port, baud: 115200, dtr: config.dtr, rts: 'off' });
        if (!closing) {
          softTimer = setTimeout(() => stop('deadline'), config.seconds * 1000);
          hardTimer = setTimeout(() => { if (!closing) stop('hard_deadline', true); transport.forceKill(); }, config.seconds * 1000 + 500);
        }
      }
    };
    const onBytes = bytes => {
      if (closing) return;
      if (!opened) { stop('bytes_before_open_confirmation', true); return; }
      try { observer.feed(bytes); } catch { stop('capture_processing_failure', true); }
    };
    const onFailure = code => stop(new Set(['identity_mismatch', 'monitor_may_be_open', 'port_busy_denied_or_unavailable', 'serial_disconnected',
      'serial_read_failed', 'serial_backpressure', 'preflight_refused', 'worker_failed', 'worker_start_failed', 'worker_protocol_refused', 'worker_control_failed']).has(code) ? code : 'transport_failure', true);
    const onClosed = code => { if (!closing) stop(code === 'disconnect' ? 'serial_disconnected' : code === 'deadline' ? 'deadline' : 'worker_closed', code !== 'deadline'); };
    const onExit = () => { if (!closing) stop('unexpected_worker_exit', true); };
    const listeners = [['opened', onOpened], ['bytes', onBytes], ['failure', onFailure], ['closed', onClosed], ['exit', onExit]];
    for (const [name, fn] of listeners) transport.on(name, fn);
    signal?.addEventListener('abort', onAbort, { once: true }); processSignals.on('SIGINT', onSigint); processSignals.on('SIGTERM', onSigterm);
    // Startup is bounded independently and does not consume the operator's
    // capture window. The read deadline starts only after port-open confirmation.
    startupTimer = setTimeout(() => stop('port_startup_timeout', true), 5000);
    diagnostic({ code: 'readonly_capture_preflight', port: config.port, dtr: config.dtr, rts: 'off', possibleReset: true });
    if (!closing) { try { transport.start(); } catch { stop('transport_start_failed', true); } }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let options;
  try { options = parseCaptureArgs(process.argv.slice(2)); }
  catch { console.error('Read-only capture requires --port COMn --confirm-pnp-id <exact-id> --seconds 1..30 --dtr on|off --ack-reset-risk --confirm-monitor-closed'); process.exitCode = 2; }
  if (options) {
    try { const result = await runReadOnlyCapture(options); process.exitCode = result.exitCode; }
    catch { console.error('Read-only capture setup failed; no raw device details were logged.'); process.exitCode = 1; }
  }
}
