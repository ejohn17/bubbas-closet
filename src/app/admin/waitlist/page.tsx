import { listWaitlist } from "@/lib/waitlist";
import { isMailchimpConfigured } from "@/lib/mailchimp";
import { MailchimpSyncButton } from "@/components/admin/MailchimpSyncButton";
import { formatDate } from "@/lib/format";

export default async function AdminWaitlist() {
  const entries = await listWaitlist();
  const configured = isMailchimpConfigured();
  const unsynced = entries.filter((e) => !e.mailchimpSyncedAt).length;

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Waitlist</h1>
      <p className="mt-2 text-stone">
        Pre-launch signups from the landing page. Sync them into Mailchimp to
        send the launch campaign.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-6">
        <div className="card px-5 py-3 text-sm">
          <span className="text-stone">Signups</span>
          <span className="ml-3 font-semibold">{entries.length}</span>
        </div>
        <div className="card px-5 py-3 text-sm">
          <span className="text-stone">Not yet in Mailchimp</span>
          <span className="ml-3 font-semibold">{unsynced}</span>
        </div>
        <MailchimpSyncButton disabled={!configured || unsynced === 0} />
      </div>

      {!configured ? (
        <p className="mt-4 text-sm text-stone">
          Set <code>MAILCHIMP_API_KEY</code> and{" "}
          <code>MAILCHIMP_AUDIENCE_ID</code> to enable syncing.
        </p>
      ) : null}

      {entries.length === 0 ? (
        <p className="card mt-8 p-8 text-center text-stone">
          No signups yet.
        </p>
      ) : (
        <ul className="card mt-8 divide-y divide-line">
          {entries.map((entry) => (
            <li
              key={entry.email}
              className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
            >
              <span className="font-medium">{entry.email}</span>
              <span className="flex items-center gap-4 text-stone">
                <span>{entry.source ?? "landing"}</span>
                <span>{formatDate(entry.createdAt)}</span>
                <span className={entry.mailchimpSyncedAt ? "" : "text-accent-dark"}>
                  {entry.mailchimpSyncedAt ? "in Mailchimp" : "not synced"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
