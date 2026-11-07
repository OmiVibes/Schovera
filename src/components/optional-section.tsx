'use client';

import { useState, type ReactNode } from 'react';

/** Secondary tools do not fetch or poll until opened. Closing unmounts them. */
export function OptionalSection({ id, title, description, children }: { id?: string; title: string; description: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <details id={id} className="optional-section" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span>{title}<small>{description}</small></span></summary>
    {open && <div className="optional-section-content">{children}</div>}
  </details>;
}
