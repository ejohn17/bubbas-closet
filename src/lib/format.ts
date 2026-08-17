/** Small display helpers shared by the portal and admin surfaces. */

export function formatDate(ms?: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(ms?: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatMoney(cents?: number | null): string {
  if (!cents) return "$0.00";
  return `$${(cents / 100).toFixed(2)}`;
}

/** "3 days overdue" / "due in 5 days" */
export function dueLabel(dueAt?: number | null, at = Date.now()): string {
  if (!dueAt) return "No due date";
  const days = Math.round((dueAt - at) / 86_400_000);
  if (days === 0) return "Due today";
  if (days > 0) return `Due in ${days} ${days === 1 ? "day" : "days"}`;
  const late = Math.abs(days);
  return `${late} ${late === 1 ? "day" : "days"} overdue`;
}

export function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
