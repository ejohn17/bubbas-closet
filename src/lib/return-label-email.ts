import { BRAND } from "@/lib/config";

/**
 * Compose URLs for the admin "send a prepaid return label" workflow.
 * The app drafts the message; staff attach the paid label in their mail client.
 */

export type ReturnLabelDraftItem = {
  productTitle: string;
  size: string;
};

export type ReturnLabelDraft = {
  to: string;
  subject: string;
  body: string;
  mailto: string;
  gmail: string;
};

function formatDue(ms?: number | null): string {
  if (!ms) return "the end of your cycle";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function returnLabelDraft(input: {
  to: string;
  name?: string | null;
  dueAt?: number | null;
  items: ReturnLabelDraftItem[];
}): ReturnLabelDraft | null {
  const to = input.to.trim();
  if (!to) return null;

  const greeting = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi,";
  const list = input.items
    .map((item) => `  • ${item.productTitle} (size ${item.size})`)
    .join("\n");
  const subject = `Time to send your ${BRAND.name} pieces back`;
  const body =
    `${greeting}\n\n` +
    `It's time to return your ${BRAND.name} box. Please send these pieces ` +
    `back by ${formatDue(input.dueAt)}:\n\n` +
    `${list || "  • your outstanding pieces"}\n\n` +
    `We've attached a prepaid return label to this email. Print it, stick it ` +
    `on the package, and drop it off.\n\n` +
    `Thank you,\nThe ${BRAND.name} team`;

  const params = `su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return {
    to,
    subject,
    body,
    mailto: `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&${params}`,
  };
}
