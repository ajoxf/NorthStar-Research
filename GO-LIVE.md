# NorthStar Research — go-live checklist

Ordered by what blocks what. Work top to bottom.

Everything here is done in a browser. If a step seems to need a terminal, it is a defect
— say so rather than working around it.

---

## 1. Register the domain — blocks almost everything else

Nothing below can be finished on a `*.vercel.app` URL. It gates three separate things:

| What | Why the domain is required |
|---|---|
| Email delivery | Resend will not send from a domain you have not verified. Without it there is no way to email a redemption code, so **nobody can complete a purchase**. |
| Cregis callbacks | `success_url` / `cancel_url` / `callback_url` are derived from `APP_BASE_URL`. Preview URLs change per deployment; a stale callback URL silently loses payments. |
| Credibility | A research service charging $199/mo from a `vercel.app` address loses sign-ups on that alone. |

Once registered:

1. Vercel → Project → Settings → Domains → add it, follow the DNS records shown.
2. Set `APP_BASE_URL=https://yourdomain.com` (Production).
3. Resend → Domains → add the same domain, add the SPF/DKIM records it gives you.
4. Set `EMAIL_FROM="NorthStar Research <reports@yourdomain.com>"` and `EMAIL_PROVIDER=resend`.

**If you are not registering a domain yet**, see §6 — there is a no-email fallback, but it
is a deliberate decision, not a default.

---

## 2. Cregis — resolve the IP allowlist

**Confirmed blocker.** Cregis's documentation states: *"The Cregis API only grants access
to IP addresses in the whitelist"*, configured per project under
API → IP Whitelist → Create Group.

Vercel serverless functions have **no static outbound IP** — calls come from a rotating
pool, so there is no single address to allowlist. Options, cheapest first:

1. **Confirm the scope first.** Send the email in §5. If allowlisting applies only to
   dashboard/withdrawal APIs and not to Payment Engine checkout creation, there is
   nothing to solve and this costs nothing.
2. **Outbound proxy** (QuotaGuard Static, Fixie) — route only the Cregis `fetch` through
   it. ~$20/mo, a few lines of code.
3. **Vercel Secure Compute** — fixed outbound IP for the whole project. Cleanest, paid tier.
4. **Small relay** on a VPS with a static IP that proxies Cregis calls.

**Do not buy anything before their answer.**

Then set in Vercel → Settings → Environment Variables (Production):

```
CREGIS_PROJECT_ID   = <Project ID from the Cregis Developer Center>
CREGIS_API_KEY      = <API Key>
CREGIS_BASE_URL     = <Base URL — no trailing slash>
```

Until all three are set, `/join` correctly shows "Crypto payments are not live yet" and
refuses to take money. That is intended behaviour, not a bug.

---

## 3. Card payments — decide whether they are in scope

`/join` offers a **Card** option described as auto-renewing, backed by
`src/app/api/checkout/stripe/route.ts`. It needs:

```
STRIPE_SECRET_KEY, STRIPE_PRICE_ID (recurring, $199/mo), STRIPE_WEBHOOK_SECRET
```

Register the webhook at `{APP_BASE_URL}/api/webhooks/stripe` for
`checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`,
`customer.subscription.deleted`.

If cards are not launching, hide the Card tab rather than leaving a dead option beside a
live one.

---

## 4. Remaining environment variables

| Variable | Notes |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32`. Sessions and signed report URLs depend on it. |
| `CRON_SECRET` | Any strong random string; Vercel Cron sends it as a bearer token. |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Injected automatically by the Neon integration. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob — report PDF storage. |
| `ADMIN_BOOTSTRAP_SECRET` | Set it, create your admin at `/admin/bootstrap`, then **delete it**. |
| `GOOGLE_CLIENT_ID` / `SECRET` | Optional. Redirect URI must be exactly `{APP_BASE_URL}/api/auth/google/callback`. |
| Twilio vars | Only if WhatsApp launches. Needs a verified business sender and pre-approved templates — a separate process with its own lead time. |

---

## 5. Email to send to Cregis support

> Subject: IP allowlist scope for Payment Engine API (project &lt;your project id&gt;)
>
> Hello,
>
> We're integrating the Payment Engine checkout API (`POST /api/v2/checkout`) for a
> subscription product, and want to confirm the IP allowlist requirements before we go
> live.
>
> Our application runs on Vercel serverless functions, which do not have a fixed outbound
> IP address — requests originate from a rotating pool.
>
> 1. Does the project IP allowlist apply to outbound API calls such as creating a payment
>    order, or only to dashboard and withdrawal operations?
> 2. If it does apply to checkout creation, is there any alternative to a static IP —
>    for example allowlisting an IP range, or authenticating by signature only?
> 3. What source IPs will your payment callbacks originate from, so we can allowlist them
>    on our side?
>
> Thank you,
> &lt;your name&gt; — NorthStar Research

---

## 6. Fixed in this branch — the integration would not have worked

The Cregis integration was broken in ways that are **silent in every log until money is
involved**. All corrected, and covered by tests in `src/lib/cregis-protocol.test.ts`:

**Outbound (`createCheckout`)**

- `project_id` → `pid`, cast to the integer the API expects
- `nonce` was a 13-digit epoch — the API requires a 6-character random string
- `timestamp`, `payer_id` and `valid_time` were missing entirely and are all required
- `product_name` is not a documented parameter → `remark`

**Inbound (`POST /api/webhooks/cregis`)**

- The handler read `order_id` / `status` off the envelope, but Cregis nests them under
  `data`. No order would ever have matched, so **no buyer would ever have been granted
  access** — and nothing would have looked wrong from our side.
- The handler replied with JSON. Cregis accepts only the literal string `success` and
  retries indefinitely otherwise.
- `paid_over` (overpayment) now grants access — the money arrived, and the surplus is a
  support conversation, not a reason to withhold the product.
- `paid_partial` (underpayment) does **not** grant access and logs loudly for review.

Run the tests with `npm test`.

---

## 7. Not doing

**Kit.** The app has its own white-label email system — templates, Resend provider, your
own sending domain. Routing member email through Kit would add kit.com-hosted unsubscribe
pages and click tracking to every message. The Kit account works if it is ever wanted for
marketing broadcasts, but it is not in the member path. Its trial ends
**27 Aug 2026** — cancel before then to avoid being billed.

Kit landing pages are cached public for 4 hours, so edits take up to that long to appear.
Hard-reload when checking.

---

## 8. Verify before announcing

Green build is not evidence. Confirm each against production:

- [ ] `/admin/bootstrap` creates an admin, then refuses a second one
- [ ] `/admin/reports/new` accepts an **FX & Currencies** PDF (this was the broken case)
- [ ] A 5 MB PDF is rejected with the size message, not a network error
- [ ] `/admin/codes` mints codes; one redeems at `/redeem` and lands on `/dashboard` active
- [ ] `/admin/payments` shows the order
- [ ] A real small Cregis payment completes: order flips to `paid`, a code is minted, the
      callback receives `success`, and a **replayed** callback does not mint a second code
- [ ] `/archive` is reachable for an active member and redirects a lapsed one
- [ ] A report link does not open in a signed-out browser
- [ ] Mobile: sign-in, dashboard, report reading view, archive
