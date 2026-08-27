import { ok, toErrorResponse } from "@/lib/api";
import { isOverdue, listPicks, markReminderSent } from "@/lib/db/picks";
import { sendOverdueNotice, sendReturnReminder } from "@/lib/email";
import { assertCronAuthorized } from "@/lib/cron";
import { RULES } from "@/lib/rules";

/**
 * Return reminders and overdue notices. Suggested schedule: daily.
 *
 * Reminders go out RULES.reminderDaysBefore days before the return due date;
 * an overdue notice follows once the date passes. Each is sent once per order —
 * late fees stay a manual call from the order screen.
 */
export async function POST(request: Request) {
  try {
    await assertCronAuthorized(request);

    const at = Date.now();
    const window = RULES.reminderDaysBefore * 24 * 60 * 60 * 1000;

    const picks = [
      ...(await listPicks({ status: "shipped" })),
      ...(await listPicks({ status: "partially_returned" })),
    ];

    let reminders = 0;
    let overdueNotices = 0;

    for (const pick of picks) {
      if (!pick.dueAt) continue;

      if (isOverdue(pick, at)) {
        if (!pick.overdueNotifiedAt) {
          await sendOverdueNotice(pick);
          await markReminderSent(pick.id, "overdueNotifiedAt");
          overdueNotices += 1;
        }
        continue;
      }

      if (!pick.reminderSentAt && pick.dueAt - at <= window) {
        await sendReturnReminder(pick);
        await markReminderSent(pick.id, "reminderSentAt");
        reminders += 1;
      }
    }

    return ok({ checked: picks.length, reminders, overdueNotices });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export const GET = POST;
