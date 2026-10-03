"use client";

import { useState, type ReactNode } from "react";

/**
 * Hides a long filter row (tags) until someone asks for it. A selected value
 * can stay visible while the rest of the list is closed.
 */
export function CollapsibleFilters({
  label,
  revealLabel = "View all tags",
  hideLabel = "Hide tags",
  defaultOpen = false,
  summary,
  children,
}: {
  label: string;
  revealLabel?: string;
  hideLabel?: string;
  defaultOpen?: boolean;
  summary?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <p className="label">{label}</p>
      {open ? (
        <div>
          {children}
          <button
            type="button"
            className="btn-outline btn-sm mt-3"
            onClick={() => setOpen(false)}
          >
            {hideLabel}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {summary}
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={() => setOpen(true)}
          >
            {revealLabel}
          </button>
        </div>
      )}
    </div>
  );
}
