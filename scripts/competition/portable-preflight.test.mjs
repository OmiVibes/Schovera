import { describe, expect, it } from 'vitest';
import { APP_HEALTH, evaluatePortableHost } from './portable-preflight.mjs';
import { origin } from './guard.mjs';

const ready = {
  platform: 'win32', windowsName: 'Windows 11 Pro', windowsBuild: '22631', arch: 'x64',
  nodeVersion: 'v22.18.0', ramBytes: 16 * 1024 ** 3,
  virtualizationReady: true,
  dockerReady: true, dockerVersion: '27.4.0', dependenciesReady: true,
  databaseReachable: true,
  supabaseStatus: 200, appStatus: 200, piHost: '10.42.0.1', piSshReachable: true,
};

describe('portable competition preflight', () => {
  it('checks the reviewed app origin used by the competition launcher', () => {
    expect(APP_HEALTH).toBe(`${origin}/`);
    expect(APP_HEALTH).toBe('http://127.0.0.1:3104/');
  });
  it('reports host readiness without asserting RFID or attendance acceptance', () => {
    const result = evaluatePortableHost(ready);
    expect(result.hostReady).toBe(true);
    expect(result.checks.find((c) => c.name === 'RFID reader').state).toBe('NOT CHECKED');
    expect(result.checks.find((c) => c.name === 'Attendance processing').state).toBe('NOT CHECKED');
  });

  it('blocks unsupported OS, architecture, Node, missing Docker, stack and Pi link', () => {
    const result = evaluatePortableHost({ ...ready, platform: 'linux', arch: 'arm64', nodeVersion: 'v23.0.0', dockerReady: false, dependenciesReady: false, databaseReachable: false, supabaseStatus: null, appStatus: null, piSshReachable: false });
    expect(result.hostReady).toBe(false);
    expect(result.checks.filter((c) => c.state === 'BLOCKED').map((c) => c.name)).toEqual(expect.arrayContaining([
      'Windows host', 'Processor architecture', 'Node.js', 'Docker engine', 'Project dependencies', 'Local PostgreSQL', 'Local Supabase Auth', 'Schovera website', 'Raspberry Pi link',
    ]));
  });

  it('requires Docker baseline memory and flags below-recommended headroom for review', () => {
    expect(evaluatePortableHost({ ...ready, ramBytes: 4 * 1024 ** 3 }).checks.find((c) => c.name === 'System memory').state).toBe('BLOCKED');
    const result = evaluatePortableHost({ ...ready, ramBytes: 8 * 1024 ** 3 });
    expect(result.checks.find((c) => c.name === 'System memory').state).toBe('REVIEW');
    expect(result.hostReady).toBe(false);
  });

  it('requires review for Windows 10 or unverified virtualization', () => {
    expect(evaluatePortableHost({ ...ready, windowsName: 'Windows 10 Pro', windowsBuild: '19045' }).hostReady).toBe(false);
    expect(evaluatePortableHost({ ...ready, virtualizationReady: null }).checks.find((c) => c.name === 'Virtualization support').state).toBe('REVIEW');
  });

  it('accepts the rehearsed Node 22 range and rejects other majors or early 22 releases', () => {
    for (const nodeVersion of ['v22.18.0', 'v22.23.5']) {
      expect(evaluatePortableHost({ ...ready, nodeVersion }).checks.find((c) => c.name === 'Node.js').state).toBe('PASS');
    }
    for (const nodeVersion of ['v20.17.9', 'v21.7.3', 'v22.17.9', 'v23.0.0']) {
      expect(evaluatePortableHost({ ...ready, nodeVersion }).checks.find((c) => c.name === 'Node.js').state).toBe('BLOCKED');
    }
  });
});
