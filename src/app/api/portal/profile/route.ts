import { ok, readJson, requireApiUser, toErrorResponse } from "@/lib/api";
import { DomainError } from "@/lib/db/base";
import { getPrimarySubscription } from "@/lib/db/subscriptions";
import { updateShippingAddress, updateSizeProfile } from "@/lib/db/users";
import {
  isCountryAllowedForTier,
  normalizeShippingCountry,
  unsupportedCountryMessage,
} from "@/lib/rules";
import type { Address, SizeProfile } from "@/lib/types";

/** Saves the member's size profile and/or shipping address. */
export async function PUT(request: Request) {
  try {
    const user = await requireApiUser();
    const body = await readJson<{
      sizeProfile?: SizeProfile;
      shippingAddress?: Address;
    }>(request);

    if (!body.sizeProfile && !body.shippingAddress) {
      throw new DomainError("nothing_to_save", "Nothing to save.");
    }

    if (body.sizeProfile) {
      await updateSizeProfile(user.uid, {
        tops: body.sizeProfile.tops?.trim() || undefined,
        bottoms: body.sizeProfile.bottoms?.trim() || undefined,
        dresses: body.sizeProfile.dresses?.trim() || undefined,
        shoes: body.sizeProfile.shoes?.trim() || undefined,
        notes: body.sizeProfile.notes?.trim() || undefined,
      });
    }

    if (body.shippingAddress) {
      const addr = body.shippingAddress;
      if (!addr.name?.trim() || !addr.line1?.trim() || !addr.city?.trim()) {
        throw new DomainError(
          "incomplete_address",
          "Name, street address, and city are required.",
        );
      }
      const country = normalizeShippingCountry(addr.country);
      const tierId = (await getPrimarySubscription(user.uid))?.tierId ?? null;
      if (!country || !isCountryAllowedForTier(country, tierId)) {
        throw new DomainError(
          "unsupported_country",
          unsupportedCountryMessage(tierId),
        );
      }
      await updateShippingAddress(user.uid, {
        name: addr.name.trim(),
        line1: addr.line1.trim(),
        line2: addr.line2?.trim() || undefined,
        city: addr.city.trim(),
        region: addr.region?.trim() ?? "",
        postalCode: addr.postalCode?.trim() ?? "",
        country,
      });
    }

    return ok();
  } catch (err) {
    return toErrorResponse(err);
  }
}
