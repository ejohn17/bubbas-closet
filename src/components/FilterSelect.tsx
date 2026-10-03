"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export type FilterOption = {
  value: string;
  label: string;
  count?: number;
};

export function FilterSelect({
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  label: string;
  value: string;
  allLabel: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  if (options.length === 0 && !value) return null;

  return (
    <label className="flex min-w-40 flex-1 flex-col sm:max-w-56">
      <span className="label">{label}</span>
      <select
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.count !== undefined
              ? `${option.label} (${option.count})`
              : option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Same dropdown, but writes the choice to a query param. */
export function FilterSelectNav({
  label,
  allLabel,
  options,
  basePath,
  param,
  current,
  extraParams,
}: {
  label: string;
  allLabel: string;
  options: FilterOption[];
  basePath: string;
  param: string;
  current: string;
  extraParams?: Record<string, string | undefined>;
}) {
  const router = useRouter();

  return (
    <FilterSelect
      label={label}
      value={current}
      allLabel={allLabel}
      options={options}
      onChange={(value) => {
        const query = new URLSearchParams();
        if (value) query.set(param, value);
        for (const [key, extra] of Object.entries(extraParams ?? {})) {
          if (extra) query.set(key, extra);
        }
        const encoded = query.toString();
        router.push(encoded ? `${basePath}?${encoded}` : basePath);
      }}
    />
  );
}

/** One panel that holds the filter dropdowns. */
export function FiltersMenu({
  activeCount,
  children,
}: {
  activeCount: number;
  children: ReactNode;
}) {
  return (
    <details className="rounded-3xl border border-line bg-card">
      <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-3">
          <span>
            Filters
            {activeCount > 0 ? (
              <span className="ml-2 text-stone">({activeCount})</span>
            ) : null}
          </span>
          <span className="text-stone" aria-hidden>
            ▾
          </span>
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-line px-5 py-4">
        {children}
      </div>
    </details>
  );
}
