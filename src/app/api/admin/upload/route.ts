import { ok, requireApiAdmin, toErrorResponse } from "@/lib/api";
import { DomainError } from "@/lib/db/base";
import { getBucket } from "@/lib/firebase-admin";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * Uploads a product image to Firebase Storage and returns a public URL.
 * Requires FIREBASE_STORAGE_BUCKET; without it the admin UI falls back to
 * pasting image URLs directly.
 */
export async function POST(request: Request) {
  try {
    await requireApiAdmin();

    const bucket = getBucket();
    if (!bucket) {
      throw new DomainError(
        "storage_not_configured",
        "Set FIREBASE_STORAGE_BUCKET to upload images, or paste an image URL instead.",
        503,
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new DomainError("missing_file", "No file was uploaded.");
    }
    if (!ALLOWED.includes(file.type)) {
      throw new DomainError("bad_type", "Images must be JPEG, PNG, WebP, or AVIF.");
    }
    if (file.size > MAX_BYTES) {
      throw new DomainError("too_large", "Images must be under 8 MB.");
    }

    const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const path = `products/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const target = bucket.file(path);

    await target.save(Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      resumable: false,
      metadata: { cacheControl: "public, max-age=31536000, immutable" },
    });
    await target.makePublic();

    return ok({
      url: `https://storage.googleapis.com/${bucket.name}/${path}`,
      path,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
