"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Search box that writes to the `search` query param and reloads the page. */
export function AdminSearch({
  placeholder,
  defaultValue,
}: {
  placeholder: string;
  defaultValue: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(defaultValue);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(params.toString());
    if (value.trim()) next.set("search", value.trim());
    else next.delete("search");
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        type="search"
        className="input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={placeholder}
      />
      <button type="submit" className="btn-outline">
        Search
      </button>
    </form>
  );
}
