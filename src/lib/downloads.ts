/**
 * Whether a member may take a copy of a report away.
 *
 * Off for now, by request.
 *
 * **One flag, read in two places, and both are load-bearing.** Hiding the button alone
 * would leave `/api/reports/[id]/download` answering anybody who still has the URL — a
 * bookmark, a browser history entry, a script — so the feature would be invisible rather
 * than disabled. The route refuses as well, and refuses for the same reason the button is
 * absent, which is why the reason lives here rather than being written out twice.
 *
 * No `server-only` guard: the reader is a client component and has to read this too. That
 * is safe because there is nothing secret in it — it is a decision, not a credential.
 *
 * Turning downloads back on is this constant and nothing else. If it becomes something to
 * change without a deploy, the natural home is an AppSetting beside the trial switches,
 * and the two call sites stay as they are.
 */
export const DOWNLOADS_ENABLED = false

/**
 * What the API says when a download is attempted while this is off.
 *
 * Phrased as a deliberate decision rather than a fault, because it is one: a member who
 * reads "something went wrong" will try again, and then write in.
 */
export const DOWNLOADS_DISABLED_MESSAGE =
  'Downloads are turned off at the moment. The report is here to read in full whenever you ' +
  'are signed in.'
