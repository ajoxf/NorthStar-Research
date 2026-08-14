# Vercel setup runbook

Step-by-step for standing this up on Vercel for the first time. Roughly 10 minutes, most
of it waiting for the database to provision.

**Never commit real secret values.** This repository is public. Every value below is set
in the Vercel dashboard, not in a file.

---

## 1. Create the project (about 30 seconds)

1. Go to <https://vercel.com/new> with the **ajoxf's projects** team selected.
2. Import **`ajoxf/NorthStar-Research`**.
3. Leave the framework preset as **Next.js** and the build settings untouched — the repo's
   `package.json` and `vercel.json` already carry the right build command and cron schedule.
4. Set the project name to **`northstar-research`**, giving you
   `northstar-research.vercel.app`.
5. **Do not click Deploy yet** — add the environment variables in step 3 first, or the first
   build will succeed but every page that touches the database will error at runtime.

Production deploys from `main`; every pull request gets its own preview URL automatically.

## 2. Provision storage

**Postgres** — Project → **Storage** → **Create Database** → **Neon**. Accept the defaults
and connect it to this project. It injects `DATABASE_URL` and `DATABASE_URL_UNPOOLED`
automatically; `prisma/schema.prisma` already reads exactly those two names, so there is
nothing to wire by hand.

**Blob** — Project → **Storage** → **Create** → **Blob**. It injects
`BLOB_READ_WRITE_TOKEN`. This is where uploaded report PDFs live.

## 3. Environment variables

Project → **Settings** → **Environment Variables**. Apply each to Production, Preview and
Development unless noted.

| Variable | Value |
| --- | --- |
| `APP_BASE_URL` | `https://northstar-research.vercel.app` (swap for the real domain later) |
| `AUTH_SECRET` | Generate: `openssl rand -base64 32` |
| `CRON_SECRET` | Generate: `openssl rand -base64 32` |
| `CREGIS_PROJECT_ID` | `REPLACE_ME_PROJECT_ID` |
| `CREGIS_API_KEY` | `REPLACE_ME_API_KEY` |
| `CREGIS_BASE_URL` | `REPLACE_ME_BASE_URL` |
| `CREGIS_ALLOWLISTED_IP` | `REPLACE_ME` |
| `EMAIL_PROVIDER` | `console` until an email account exists, then `resend` |
| `WHATSAPP_PROVIDER` | `console` until a WhatsApp sender exists, then `twilio` |
| `ADMIN_BOOTSTRAP_SECRET` | Any value you choose. Enables `/admin/bootstrap`. **Delete after use.** |
| `STRIPE_SECRET_KEY` | `REPLACE_ME_STRIPE_SECRET_KEY` until you set Stripe up |
| `STRIPE_PRICE_ID` | `REPLACE_ME_STRIPE_PRICE_ID` — must be a **recurring monthly $199** price |
| `STRIPE_WEBHOOK_SECRET` | `REPLACE_ME_STRIPE_WEBHOOK_SECRET` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Leave unset to hide the Google button |

`DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `BLOB_READ_WRITE_TOKEN` come from step 2 — do
not add them by hand.

The four `CREGIS_*` placeholders are deliberate. The code treats any value containing
`REPLACE_ME` as unset and fails loudly rather than silently: `/api/checkout/create` returns
a 503 saying payments are not configured, and the webhook refuses to process a callback it
cannot verify. A placeholder can never be mistaken for a working integration.

`AUTH_SECRET` signs both session cookies and the short-lived report URLs. Changing it later
signs every member out and invalidates outstanding report links — expected, but do it
deliberately.

## 4. Deploy, then initialise the database

Deploy from the dashboard. The schema still has to be created once — from a local checkout
with the same `DATABASE_URL`:

```bash
npm install
npx prisma db push
```

Then create the first administrator. Either:

**From the browser** (no local setup): set `ADMIN_BOOTSTRAP_SECRET` in Vercel, redeploy,
and visit `/admin/bootstrap`. It creates the admin, signs you in, and refuses to run ever
again once an admin exists. Delete the variable afterwards.

**Or from the CLI:** `npm run create-admin -- --email=you@example.com`, which prints a
generated password once.

Either way you then sign in at `/admin/login`.

## 4b. Payment providers

**Stripe** (card subscriptions, auto-renewing):

1. Create a **recurring monthly** price of $199 in the Stripe product catalogue and copy
   its `price_...` id into `STRIPE_PRICE_ID`. A one-off price will not subscribe anyone.
2. Add a webhook endpoint at `{APP_BASE_URL}/api/webhooks/stripe` subscribed to
   `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated` and
   `customer.subscription.deleted`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

**Google sign-in** (optional): create an OAuth client (Web) in the Google Cloud Console
with the authorised redirect URI `{APP_BASE_URL}/api/auth/google/callback`. Only
openid/email/profile scopes are used, so no app review is required.

Optionally `npm run seed-demo` for three published reports and a demo member, so the
dashboard and archive have something in them for a walkthrough. Do not run it against real
production data once the site is live.

## 5. Verify

- `/` — landing page, locked report-format preview, full disclaimer in the footer
- `/admin/login` → `/admin` — the overview's **Integration status** panel should show
  Postgres and Blob ready, and Cregis/email/WhatsApp as "Not configured"
- `/admin/reports/new` — upload a PDF, then publish it
- `/dashboard` — the report appears; opening it records a view and watermarks the page
- `/reports/<id>` in a private window — must bounce to `/login?next=…`, never render content

The cron at `/api/cron/weekly-send` is registered by `vercel.json` and runs weekdays at
12:00 UTC. It refuses to run unless `CRON_SECRET` is set, so it is inert until step 3 is done.

## 6. Before going live

- Real Cregis credentials, pasted over the four placeholders.
- A decision on the **static outbound IP** for Cregis — see the note at the top of
  `src/lib/cregis.ts`. Vercel functions have no fixed outbound IP by default.
- Email and WhatsApp provider accounts. WhatsApp needs business verification and approved
  templates, which is a separate signup with its own lead time.
- The real domain, added under Settings → Domains, then update `APP_BASE_URL` **and**
  `SITE_DOMAIN` in `src/components/disclaimer.tsx`.
- Approved Privacy Policy copy replacing the placeholder at `/privacy-policy`.
- Recommended: 2FA on the admin account before real credentials land, since it can see the
  whole member list and trigger sends to it.
