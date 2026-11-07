// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { OptionalSection } from './optional-section';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('keeps optional content unmounted until opened, then stops it when closed', async () => {
  let mounted = 0;
  function Tool() { useEffect(() => { mounted++; return () => { mounted--; }; }, []); return <p>Secondary tool</p>; }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<OptionalSection title="Gate scans" description="Optional records"><Tool /></OptionalSection>));
    expect(mounted).toBe(0);
    const details = host.querySelector('details')!;
    expect(host.querySelector('summary')?.textContent).toContain('Gate scans');
    await act(async () => { details.open = true; details.dispatchEvent(new Event('toggle')); });
    expect(mounted).toBe(1);
    expect(host.textContent).toContain('Secondary tool');
    await act(async () => { details.open = false; details.dispatchEvent(new Event('toggle')); });
    expect(mounted).toBe(0);
    expect(host.textContent).not.toContain('Secondary tool');
  } finally { await act(async () => root.unmount()); host.remove(); }
});
