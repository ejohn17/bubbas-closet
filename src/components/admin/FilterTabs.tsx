import Link from "next/link";

export type FilterOption = {
  value: string;
  label: string;
  count?: number;
};

/** Query-param driven filter row (plain links, no client JS needed). */
export function FilterTabs({
  basePath,
  param = "status",
  options,
  current,
  extraParams,
}: {
  basePath: string;
  param?: string;
  options: FilterOption[];
  current: string;
  extraParams?: Record<string, string | undefined>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option.value === current;
        const query = new URLSearchParams();
        if (option.value) query.set(param, option.value);
        for (const [key, value] of Object.entries(extraParams ?? {})) {
          if (value) query.set(key, value);
        }
        const encoded = query.toString();
        const href = encoded ? `${basePath}?${encoded}` : basePath;

        return (
          <Link
            key={option.value || "all"}
            href={href}
            aria-current={active ? "true" : undefined}
            className={`pill border ${
              active
                ? "border-ink bg-ink text-cream"
                : "border-line bg-card text-stone hover:border-accent"
            }`}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="ml-1.5 opacity-70">{option.count}</span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
