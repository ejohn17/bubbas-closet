import { titleCase } from "@/lib/format";

/** Shared colour language for pick, unit, and subscription statuses. */
const TONES: Record<string, string> = {
  // Picks
  pending: "bg-amber-100 text-amber-900",
  shipped: "bg-sky-100 text-sky-900",
  partially_returned: "bg-indigo-100 text-indigo-900",
  returned: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-line text-stone",
  overdue: "bg-red-100 text-red-800",
  // Units
  available: "bg-emerald-100 text-emerald-900",
  reserved: "bg-amber-100 text-amber-900",
  out: "bg-sky-100 text-sky-900",
  cleaning: "bg-indigo-100 text-indigo-900",
  retired: "bg-line text-stone",
  // Subscriptions
  active: "bg-emerald-100 text-emerald-900",
  trialing: "bg-sky-100 text-sky-900",
  past_due: "bg-red-100 text-red-800",
  canceled: "bg-line text-stone",
  unpaid: "bg-red-100 text-red-800",
  paused: "bg-line text-stone",
};

export function StatusPill({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  return (
    <span className={`pill ${TONES[status] ?? "bg-line text-stone"}`}>
      {label ?? titleCase(status)}
    </span>
  );
}
