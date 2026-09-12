/**
 * Only same-origin, absolute-path redirects are allowed after sign-in, so a
 * crafted `?next=` can't bounce a member to another host.
 */
export function safeNext(value: string | undefined, fallback = "/portal"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
