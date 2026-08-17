"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UnitCondition, UnitStatus } from "@/lib/types";

const CONDITIONS: UnitCondition[] = ["new", "excellent", "good", "fair"];

/**
 * Per-garment controls. `reserved` and `out` are set by the app itself (holds
 * and shipped orders), so they aren't offered here — returns are recorded from
 * the order instead.
 */
export function UnitActions({
  unitId,
  status,
  condition,
}: {
  unitId: string;
  status: UnitStatus;
  condition: UnitCondition;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(payload: {
    status?: UnitStatus;
    condition?: UnitCondition;
  }) {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/admin/units/${unitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "Could not update this garment.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <select
        className="input w-32 px-3 py-1.5 text-xs"
        value={condition}
        disabled={pending}
        aria-label="Condition"
        onChange={(e) => patch({ condition: e.target.value as UnitCondition })}
      >
        {CONDITIONS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {status === "cleaning" ? (
        <button
          type="button"
          className="btn-outline btn-sm"
          disabled={pending}
          onClick={() => patch({ status: "available" })}
        >
          Back in closet
        </button>
      ) : null}

      {status === "available" ? (
        <button
          type="button"
          className="btn-outline btn-sm"
          disabled={pending}
          onClick={() => patch({ status: "cleaning" })}
        >
          To cleaning
        </button>
      ) : null}

      {status === "retired" ? (
        <button
          type="button"
          className="btn-outline btn-sm"
          disabled={pending}
          onClick={() => patch({ status: "available" })}
        >
          Un-retire
        </button>
      ) : (
        <button
          type="button"
          className="btn-danger btn-sm"
          disabled={pending || status === "out" || status === "reserved"}
          onClick={() => patch({ status: "retired" })}
        >
          Retire
        </button>
      )}

      {error ? (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}
