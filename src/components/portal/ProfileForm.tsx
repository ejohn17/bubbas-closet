"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Address, SizeProfile } from "@/lib/types";

/**
 * Size profile + shipping address. The address is required before a box can be
 * confirmed, and is prefilled from Stripe Checkout when available.
 */
export function ProfileForm({
  sizeProfile,
  shippingAddress,
}: {
  sizeProfile?: SizeProfile;
  shippingAddress?: Address | null;
}) {
  const router = useRouter();
  const [sizes, setSizes] = useState<SizeProfile>(sizeProfile ?? {});
  const [address, setAddress] = useState<Address>(
    shippingAddress ?? {
      name: "",
      line1: "",
      line2: "",
      city: "",
      region: "",
      postalCode: "",
      country: "US",
    },
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);

    try {
      const res = await fetch("/api/portal/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sizeProfile: sizes, shippingAddress: address }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "Could not save your details.");
        return;
      }

      setSaved(true);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8">
      <fieldset>
        <legend className="text-lg font-semibold">Your sizes</legend>
        <p className="mt-1 text-sm text-stone">
          We use these to sort the closet for you first.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {(
            [
              ["tops", "Tops"],
              ["bottoms", "Bottoms"],
              ["dresses", "Dresses"],
              ["shoes", "Shoes"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="label" htmlFor={`size-${key}`}>
                {label}
              </label>
              <input
                id={`size-${key}`}
                className="input"
                value={sizes[key] ?? ""}
                onChange={(e) => setSizes({ ...sizes, [key]: e.target.value })}
                placeholder="e.g. M"
              />
            </div>
          ))}
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="size-notes">
            Fit notes
          </label>
          <textarea
            id="size-notes"
            className="input min-h-20"
            value={sizes.notes ?? ""}
            onChange={(e) => setSizes({ ...sizes, notes: e.target.value })}
            placeholder="Anything we should know — long torso, prefer relaxed fits…"
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-lg font-semibold">Shipping address</legend>
        <p className="mt-1 text-sm text-stone">
          Where your box goes each month. Shipping is included both ways.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="addr-name">
              Full name
            </label>
            <input
              id="addr-name"
              className="input"
              required
              value={address.name}
              onChange={(e) => setAddress({ ...address, name: e.target.value })}
              autoComplete="name"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="addr-line1">
              Street address
            </label>
            <input
              id="addr-line1"
              className="input"
              required
              value={address.line1}
              onChange={(e) => setAddress({ ...address, line1: e.target.value })}
              autoComplete="address-line1"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="addr-line2">
              Apartment, suite (optional)
            </label>
            <input
              id="addr-line2"
              className="input"
              value={address.line2 ?? ""}
              onChange={(e) => setAddress({ ...address, line2: e.target.value })}
              autoComplete="address-line2"
            />
          </div>
          <div>
            <label className="label" htmlFor="addr-city">
              City
            </label>
            <input
              id="addr-city"
              className="input"
              required
              value={address.city}
              onChange={(e) => setAddress({ ...address, city: e.target.value })}
              autoComplete="address-level2"
            />
          </div>
          <div>
            <label className="label" htmlFor="addr-region">
              State
            </label>
            <input
              id="addr-region"
              className="input"
              value={address.region}
              onChange={(e) => setAddress({ ...address, region: e.target.value })}
              autoComplete="address-level1"
            />
          </div>
          <div>
            <label className="label" htmlFor="addr-postal">
              ZIP
            </label>
            <input
              id="addr-postal"
              className="input"
              value={address.postalCode}
              onChange={(e) =>
                setAddress({ ...address, postalCode: e.target.value })
              }
              autoComplete="postal-code"
            />
          </div>
          <div>
            <label className="label" htmlFor="addr-country">
              Country
            </label>
            <input
              id="addr-country"
              className="input"
              value={address.country}
              onChange={(e) => setAddress({ ...address, country: e.target.value })}
              autoComplete="country"
            />
          </div>
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm text-accent-dark">
          Saved.
        </p>
      ) : null}

      <div>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save details"}
        </button>
      </div>
    </form>
  );
}
