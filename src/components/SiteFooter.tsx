import Link from "next/link";
import { BRAND } from "@/lib/config";

/** Footer for public pages. Legal links here are also what Stripe expects. */
export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-6 py-10 text-sm text-stone">
      <div className="flex flex-col items-center justify-between gap-3 border-t border-line pt-6 sm:flex-row">
        <span>
          © {new Date().getFullYear()} {BRAND.name}
        </span>

        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/terms" className="transition hover:text-ink">
            Rental terms
          </Link>
          <Link href="/privacy" className="transition hover:text-ink">
            Privacy
          </Link>
          <a
            href={`mailto:${BRAND.contactEmail}`}
            className="transition hover:text-ink"
          >
            {BRAND.contactEmail}
          </a>
        </nav>
      </div>
    </footer>
  );
}
