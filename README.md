# NorthStar Research — Member Portal

A membership portal for a financial research firm. Members subscribe at **$199/month** by
card or crypto, receive a one-time access code, create an account with it, and get four
weekly research reports — commodities, international markets and indices, options/crypto and
spreads, and FX — plus the full archive. The member database doubles as a lightweight
CRM, and the weekly report drop is a triggered send to that list rather than a manual
per-person task.

**Billing works two ways, and the difference is real.** Stripe card subscriptions renew
themselves. Cregis crypto payments cannot — a crypto payment is a push with no stored
mandate to charge against — so those members renew manually and get a reminder before their
period ends. Both settle to the same `Member.subscriptionRenewsAt`, which is the single
field that gates access.

**Sign-in** is Google, email + password, or a magic link — all reaching one account.
Signing in is identity only; it never grants entitlement, which is checked separately.

Next.js 14 (App Router) · TypeScript · Postgres/Prisma · Tailwind · Vercel Blob · Vercel Cron

---

## Table of contents

- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [How the pieces fit](#how-the-pieces-fit)
- [Portability: swapping delivery for Kit.com](#portability-swapping-delivery-for-kitcom)
- [What "not shareable" actually means](#what-not-shareable-actually-means)
- [Open items before launch](#open-items-before-launch)
- [Deployment](#deployment)

---

## Quick start

```bash
npm install
cp .env.example .env.local        # then fill in DATABASE_URL and AUTH_SECRET
npm run db:push                   # create the schema
npm run create-admin -- --email=you@example.com
npm run seed-demo                 # optional: a demo member + published reports
npm run dev
```

`AUTH_SECRET` can be generated with `openssl rand -base64 32`.

With no email or WhatsApp provider configured, delivery falls back to a **console
provider** that logs what it would have sent. The whole publish-and-deliver flow is
exercisable end to end before any vendor account exists — but every log line is prefixed
so nobody mistakes it for real delivery, and the admin overview shows the integration as
"Not configured".

| Route | What it is |
| --- | --- |
| `/` | Marketing page with the locked report-format preview |
| `/join` → `/redeem` | Checkout, then the three-step activation wizard |
| `/dashboard`, `/archive`, `/reports/[id]` | Member portal and report reader |
| `/tools`, `/tools/withdrawal-planner` | Member analysis tools (client-side only) |
| `/account` | Profile, password, WhatsApp opt-in and verification |
| `/admin/login` → `/admin` | Admin console (report upload + member CRM) |

---

## Environment variables

See `.env.example` for the full annotated list. The ones that must be real before launch:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | Postgres. Pooled for runtime, direct for migrations. Both are injected automatically by the Neon integration in the Vercel Marketplace. |
| `AUTH_SECRET` | Signs session cookies **and** short-lived report URLs. |
| `APP_BASE_URL` | Used for every link sent by email/WhatsApp and for Cregis callback URLs. |
| `CRON_SECRET` | The weekly send refuses to run without it. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob, for uploaded PDFs. |
| `CREGIS_PROJECT_ID` / `CREGIS_API_KEY` / `CREGIS_BASE_URL` | **Ships as `REPLACE_ME` placeholders on purpose.** |
| `EMAIL_PROVIDER` + provider key | `console` (default), `resend`. |
| `WHATSAPP_PROVIDER` + provider creds | `console` (default), `twilio`. |

**Placeholders fail loudly, never silently.** `src/lib/env.ts` treats any value containing
`REPLACE_ME` as unset. Invoking the Cregis client with a placeholder throws a
`MissingConfigError` naming every missing key; `/api/checkout/create` turns that into a 503
that says payments are not configured, and the Cregis webhook rejects the callback rather
than processing a payment it cannot verify. A placeholder must never be mistaken for a
working integration.

---

## How the pieces fit

### Payment → code → account

1. `POST /api/checkout/create` records a `CheckoutOrder` as `pending`, then signs and calls
   Cregis to create a $199 order.
2. Cregis calls `POST /api/webhooks/cregis` server-to-server. The signature is verified
   (MD5 of the API key + sorted `key=value` pairs) **before anything in the payload is
   trusted**.
3. Only on a verified `paid` callback is a `RedemptionCode` minted (`NSR-XXXX-XXXX`, using
   an alphabet with no 0/O or 1/I confusion) and emailed to the buyer.
4. `/redeem` claims the code inside a transaction and activates the membership.

`/checkout/success` grants nothing — it is a "check your email" page. Anyone can visit that
URL without paying, which is exactly why access is never derived from it.

### Reports

Admins upload a PDF at `/admin/reports/new`. The PDF goes to Vercel Blob, and its text layer
is extracted into responsive HTML for the mobile reading view, because a raw PDF neither
reflows on a phone nor renders in an email. Admins can edit or replace that HTML, and can
supply a JSON instrument table that becomes the tabbed view at the top of the report.

Upload creates a **draft**. Publishing is the separate, confirmed action that makes the
report visible and sends it. Reports are never deleted — there is no DELETE handler on the
report route at all; un-publishing hides a report while keeping the row and its history.

### Delivery

Publishing (or the weekly cron) calls `deliverReportToActiveMembers`, which writes one
`DeliveryLog` row per member per channel. A `[memberId, reportId, channel]` unique
constraint makes sends idempotent, so a cron retry or an admin re-publish never
double-messages anyone. WhatsApp requires opt-in **and** a verified number — an unverified
opt-in is shown as a pending state rather than silently messaged.

---

## Portability: swapping delivery for Kit.com

The client may later hand delivery and CRM off to an external ESP. That was designed for,
not deferred.

**The seam is `NotificationProvider`** (`src/lib/notifications/types.ts`):

```ts
interface NotificationProvider {
  sendReportEmail(recipient, report, reportUrl): Promise<DeliveryResult>
  sendReportWhatsApp(recipient, report, reportUrl): Promise<DeliveryResult>
  sendRedemptionCodeEmail(recipient, code, redeemUrl): Promise<DeliveryResult>
  sendRedemptionCodeWhatsApp(recipient, code, redeemUrl): Promise<DeliveryResult>
}
```

Nothing outside `src/lib/notifications/` imports a vendor SDK. Checkout, redemption,
publishing and the weekly cron all call the interface.

**To migrate to Kit:**

1. Write `src/lib/notifications/kit-provider.ts` implementing `NotificationProvider`.
2. Add one `case 'kit':` to `emailProvider()` in `src/lib/notifications/index.ts`.
3. Set `EMAIL_PROVIDER=kit`.

That is the whole change. No edits to payment, redemption, report or CRM logic.

**The schema is ESP-shaped too.** `Member` keeps email, first/last name, `tags String[]` and
a notes field as plain first-class columns — the exact shape Kit and most ESPs use for
subscribers, tags and custom fields. Nothing essential is buried in an opaque JSON blob.
(`Report.instruments` is JSON, but that is presentation data, not contact data.)

**The CSV export is the migration path.** `/api/admin/members/export` emits RFC 4180 CSV with
tags comma-delimited inside a quoted field, which is what ESP importers expect. It respects
the current filter, so a segment can be exported and handed over as-is. It is kept complete
and accurate deliberately, rather than treated as a debug afterthought.

---

## What "not shareable" actually means

Be straightforward with the client about this: **no web content is screenshot-proof.** What
this system does is make casual link-sharing pointless and leaks traceable.

- **No public, permanent report URLs.** Every payload fetch goes through a short-lived
  (12-minute) signed token bound to one member id and one report id. The Vercel Blob URL is
  never handed to the browser — downloads are proxied through `/api/reports/[id]/file`.
- **Every channel link requires a session.** Email and WhatsApp carry a link to
  `/reports/[id]`, which bounces an anonymous request to `/login?next=…`. A forwarded link
  is worthless to whoever receives it; the intended member lands back on the report after
  signing in.
- **Tokens do not outlive the subscription.** The file route re-checks membership at fetch
  time, so a token minted before a cancellation stops working.
- **Watermarking.** The reader overlays a repeating diagonal watermark carrying the viewing
  member's email and account id, at low opacity behind the text.
- **Audit trail.** Every view logs member, time, IP and user agent. The admin member detail
  view surfaces distinct IP count, so one account being read from many devices is visible.
- **Print is disabled** in the reader; the legitimate route is the "Download for offline
  reading" action, which is itself logged.

**What none of this stops:** a member photographing their own screen, or retyping the
content. The honest claim is *traceable*, not *unshareable*. Please do not sell it as the
latter.

---

## Open items before launch

Things this build deliberately did not decide, and things that need a real value.

**Needs a decision (flagged, not resolved):**

- **Static outbound IP for Cregis.** Vercel serverless functions have no fixed outbound IP,
  so calls to Cregis will come from a rotating pool and will fail once allowlisting is
  enforced. `CREGIS_ALLOWLISTED_IP` is a placeholder and there is a note at the top of
  `src/lib/cregis.ts`. The options are Vercel Secure Compute, an outbound proxy with a fixed
  IP (QuotaGuard Static, Fixie), or isolating the Cregis calls into a small always-on
  service. **This was intentionally not chosen — it is a client decision.**

**Needs credentials / an account:**

- **Cregis** — Project ID, API Key, Base URL. Placeholders until the client pastes real
  values into Vercel.
- **Email provider** — an account and API key. Built against Resend; any provider is a new
  implementation of the interface above.
- **WhatsApp Business API** — a separate signup with its own business verification, plus
  pre-approved message templates. A personal WhatsApp number cannot be used and this cannot
  be faked. Built against Twilio; `TWILIO_WHATSAPP_TEMPLATE_SID` is the approved template
  for the weekly report notification.

**Needs content:**

- **Production domain** — currently `northstarresearch.com` in `src/components/disclaimer.tsx`
  (`SITE_DOMAIN`). The disclaimer names it as the sole official channel, so it must be right.
- **Privacy Policy** — `/privacy-policy` is a clearly-labelled placeholder. It accurately
  describes what the system does with member data, which makes it a useful brief for a
  lawyer, but it has not been reviewed by one.
- **FAQs** — `/faqs` answers are accurate about how the platform behaves; the commercial
  answers (refunds, support routes) need client sign-off.

**Recommended, not blocking:**

- **2FA/TOTP on the admin login** before real Cregis credentials go live. That account can
  see the full member list and trigger a send to it.

The Section 8 disclaimer itself is reproduced verbatim in `src/components/disclaimer.tsx` and
rendered in the site-wide footer and at `/disclaimer`. Do not shorten or paraphrase it.

---

## Deployment

1. Connect this repo to a Vercel project (Settings → Git → Connect Git Repository).
2. Provision Postgres via **Storage → Create Database → Neon**, which injects `DATABASE_URL`
   and `DATABASE_URL_UNPOOLED` into the project by itself, and Vercel Blob for the
   `BLOB_READ_WRITE_TOKEN`.
3. Set every variable from `.env.example`. Set the three `CREGIS_*` values and
   `CREGIS_ALLOWLISTED_IP` to clearly-labelled `REPLACE_ME` placeholders for now.
4. Deploy, then run `npm run db:push` (or `prisma migrate deploy`) against the production
   database, and `npm run create-admin -- --email=…` to seed the first admin.
5. `vercel.json` registers the weekly cron at `/api/cron/weekly-send`. It publishes any
   report whose publish date has arrived and delivers it, sharing the idempotent delivery
   path with the admin Publish button so the two cannot double-send.

Preview deployments work with placeholder credentials. **Production should not go live until
the placeholders above are real** — the code will refuse to process payments while they are
not, which is the intended behaviour, not a bug.

### Security notes

- Admin authorisation is checked server-side in the `/admin` layout **and** independently in
  every admin route handler. A layout guard alone would not protect the API routes.
- Sessions are signed JWTs in httpOnly cookies, but role and subscription status are re-read
  from the database on every request, so revoking access takes effect immediately rather
  than when the token expires.
- Admin-authored report HTML is allow-list sanitised before storage (it is rendered with
  `dangerouslySetInnerHTML` into every member's browser).
- The `next` parameter on `/login` only accepts same-origin relative paths, so a "sign in to
  read your report" link cannot be turned into an open redirect.
- There is no public signup path for admin accounts; the first is seeded via
  `npm run create-admin`.
