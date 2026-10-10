# Build brief — affiliate portal, expert portal, cart, and the legal pack

A refined specification for the next phase of NordStar Pro, written to be picked up in a
fresh session. It assumes no memory of the conversation it came from.

**Status of the repo at the time of writing:** `main` is at the discounts/audience release.
**PR #80 (contributor ledger and withdrawal approvals) is open and unmerged** — several
items below build directly on it, and one reworks part of it. Merge it first.

---

## 0. What this platform is, in one paragraph

NordStar Pro is an **aggregator of independent subject matter experts** selling
subscription research. It is not an advisory firm and does not give financial advice. Each
expert writes one or more *sections*; a section is one topic by one author; members buy
sections individually or in *packages*. Access is granted by *entitlements*, checked in
exactly one place (`src/lib/report-access.ts`). Payment runs on two rails: Stripe for
cards, Cregis for crypto. This positioning is load-bearing for the legal documents in §9
and should be visible in the product, not only in the small print.

---

## 1. Decisions already made — do not re-litigate

| Decision | Answer |
|---|---|
| **Login model** | One `Member` account with capabilities attached. `Affiliate.memberId` and a new `Author.memberId` link an existing member to a role. One person may be a subscriber *and* an expert *and* an affiliate at once. |
| **Affiliate payouts** | Ledger first, payment by hand, automated rails later. Affiliates become parties on the existing earnings ledger. |
| **Cart and revenue** | Orders gain **line items**. Revenue attributes **per line**, not per order. |
| **Revenue basis** | **Net** revenue — after refunds, cashbacks, affiliate/IB charges, bank and gateway charges, and tax. All deducted *before* any split. This matches what the ledger already does. |
| **Legal entity** | **Northstar International** is the contracting entity; **NordStar Pro** is the platform/brand. Country, company number, registered address and governing law remain marked placeholders until confirmed. |
| **Deduction order** | Fees come off the top. Expert and platform each bear their share. Already encoded in `src/lib/earnings.ts`. |
| **Holdback** | 30 days from when payment clears, before earnings can be withdrawn. |
| **Attribution** | By who sold it, not by who reads it. |

---

## 2. Standing constraints — these have held all along

- **Never commit secrets.** No API key, token or tag id in any tracked file, frontend
  bundle, or log line. Stripe, Cregis and Resend credentials are the owner's to enter.
- **`scripts/db-deploy.mjs` runs `prisma db push` against the LIVE database on every
  Vercel build**, with no `--accept-data-loss`. Every schema change must therefore be
  additive: new tables, new nullable columns, new columns with defaults. Verify by running
  the same push against a local copy and confirming it reports a plain sync with no
  data-loss prompt.
- **Do not weaken the access model.** `isAllAccess()` → `canReadReport()` → entitlements
  stays the single path. New roles must not create a second way to answer "can this person
  read this".
- **Do not change any price without explicit confirmation.**
- **Nothing is ever deleted.** Archive, never destroy, anything that is a record of what
  somebody bought or was paid.
- **nordstarpro.com is live.** Do not push to `main`; Vercel auto-deploys it.
- Refer to contributors as **subject matter experts**, not "authors", in anything a user
  sees. (`Author` remains the model name internally.)
- Verify by rendering and by driving the running app, not by reading the code back.

---

## 3. The nine workstreams

### 1 — Affiliate portal

**What exists.** `Affiliate` (slug, reward terms, `visitorDiscountPercent`, `memberId`),
`Referral` (a funnel row created on click), `AffiliateAward` (an append-only ledger whose
comment says payment happens outside the system). An admin console at `/admin/affiliates`.
`visitorDiscountPercent` is **displayed in the admin and applied nowhere** — a real bug.

**To build.**
- Sign-in for affiliates via the shared member account; a portal at `/affiliate`.
- Dashboard: clicks, sign-ups, conversions, commission earned, commission paid, what is
  held, what is available.
- Their affiliate link shown prominently and copyable, plus per-link breakdown if they
  have more than one.
- A list of **members they introduced** — see the privacy question in §4.
- Commission accrues onto the **same ledger built in PR #80**, as a second party type
  alongside experts. Do not build a parallel ledger.
- Withdrawal requests go through the **same approval flow**.
- Fix `visitorDiscountPercent` so it either applies at checkout or is removed. A field the
  admin promises and the code ignores is worse than no field.

**Gotcha.** Affiliate commission is one of the deductions taken *before* the expert split.
An affiliate and an expert can both be owed on the same sale, and the order of deduction is
already decided (§1). Wire commission into `OrderFinancials.ibFeeCents` rather than
inventing a second path.

---

### 2 — Subject matter expert portal

**What exists.** `Author` is deliberately not a login — "a name, a face, a biography" — but
its own comment says *"When author logins are wanted later they attach to this record
rather than replacing it."* There is already an admin-only weekly subscriber report
(`src/lib/author-report.ts`, `author-report-pdf.ts`) which is **aggregate only, by
design**: no member names, no addresses.

**To build.**
- `Author.memberId`, and a portal at `/expert`.
- Sales and revenue: gross, deductions, net, their share, what is held, what is available,
  what has been paid.
- Their own ledger, same source as the admin's.
- Subscriber **counts and trends** — reuse `summariseAuthorWeek`, which already computes
  live/started/lapsed, an 8-week trend, composition by payment route, and renewals due.
- Withdrawal requests through the same approval flow.

**Hard requirement.** The expert must never see who their subscribers are. The existing
weekly report already enforces this — the query selects counts and dates, never a member
relation. Hold that line in the portal: no names, no emails, no per-member rows, and no
endpoint that could be enumerated to reconstruct them.

---

### 3 — Admin console: sign out, larger text, light/dark

**What exists.** A vertical rail at `lg` and above, a horizontal scroller below. **No sign
out anywhere in the admin.** No theme switching: the console is dark-only, and
`globals.css` has no `prefers-color-scheme` handling.

**To build.**
- Sign out in the admin header, beside the email that is already shown.
- Increase the console's base type size. It is currently 12–15px throughout; the rail and
  table text are the worst of it.
- Light and dark mode with an explicit toggle, remembered per viewer, defaulting to the
  system preference.

**Gotcha.** The site already has a two-ground system — the `Band` component, where ground
and ink move together (`dark` / `light` / `lime`), and tone props threaded through the
field and button components. A theme toggle must build on that rather than introduce a
second colour mechanism. Expect this to be larger than it sounds: every admin surface
currently assumes the dark ground.

---

### 4 — Cart and multi-item checkout

**What exists.** Single-item checkout only. `/api/checkout/section` buys one section;
`/api/checkout/create` and `/api/checkout/stripe` buy one package. `CheckoutOrder` carries
a single `sectionId` or `packageId`.

**To build.**
- A cart holding any mix of sections and packages.
- `OrderLine`: order, item, quantity, unit price, discount applied, and **the expert the
  line is attributed to**.
- Revenue attribution moves from order to line. Deductions that belong to the whole order
  (gateway fee, tax) are apportioned across lines in proportion to line value.
- Affiliate attribution survives a cart: arriving by an affiliate link and then buying four
  things should credit the affiliate on all four.

**This reworks PR #80.** `postPendingEarnings` currently resolves one author per order via
`authorIdForOrder`. It becomes one earning per line. The pure calculation in `earnings.ts`
does not change — it already takes an `OrderFinancials` and a percentage, and knows nothing
about orders.

**Open questions in §4 below**: mixed billing intervals, trials in a cart, and whether a
cart can contain something the buyer already owns.

---

### 5 — Free trials without admin activation

**Finding: this is already half-true.** A visitor can start a trial today at `/trial` with
an email and a password — no admin step, no code. The three refusals are `disabled`,
`already_trialled` and `already_a_member`. There is no approval queue.

What the admin must do is switch `trialEnabled` on **per section**, and it defaults to
`false`. The original reasoning is in the schema: *"a section created tomorrow must not
arrive giving away a free fortnight nobody decided on."* That reasoning was right for a
desk with one product and is wrong for a marketplace meant to convert.

**To build.** A house-level default for new sections, with the per-section override kept so
a specific section can still be excluded. See the question in §4 about whether existing
sections should be switched on too.

---

### 6 — "Starter" and "Institutional"

**What exists.** An `Audience` enum of `retail | institutional`, nullable on `Section`, with
an admin select, a public badge and a "Priced for" filter. Shipped and working.

**To build.** Rename `retail` → `starter` in the user-facing labels. Decide whether the
enum value itself changes — see §4. The filter, the badge and the admin select all read
from one place, so this is small either way.

---

### 7 — Grant access in days, not only months

**What exists.** `src/app/admin/members/[id]/access-panel.tsx` offers 1 / 3 / 6 / 12 months
and open-ended, via a `months` state variable.

**To build.** Allow a number of days. Keep the month presets, which are what gets used most,
and add a free-entry day field — a 7-day or 14-day comp is the common case this cannot
express today.

---

### 8 — Reviews and ratings on sections

**What exists.** Nothing.

**To build.** A star rating and an optional written comment per section, displayed only
when the admin turns it on for that section.

**Gotchas, and they are not small.** Testimonials about financial research are a
regulated-adjacent area; the attached legal pack has a "Marketing and testimonials" section
for exactly this reason. A review saying "made me 40% last quarter" is a performance claim
the platform is publishing. This needs moderation before display, not after — see §4.

---

### 9 — The legal pack

**Source.** A supplied draft pack for *FinCoursa*, a course platform: Disclaimers, Privacy
Policy, Refund and Cancellation, Terms and Conditions, Regulatory Status and Disclosures,
Conflicts of Interest, and Complaints Handling. Well structured and a good skeleton.

**It cannot be adapted by find-and-replace.** Two structural mismatches:

1. **It is written for one-off course purchases.** It speaks of lessons, quizzes,
   enrolment, certificates, "completing a substantial part of the course". NordStar Pro
   sells **recurring subscriptions to ongoing research**. The refund policy in particular
   needs rewriting around a different question: not "did you finish it" but "cancel before
   the next renewal, and what happens to the period already paid for".
2. **It assumes the publisher is the teacher.** NordStar Pro is an **aggregator**. The
   platform does not produce the research and does not endorse it.

**The positioning to carry throughout**, in the owner's own words:

> NordStar Pro is an aggregator platform of subject matter experts and does not provide any
> financial advice. All views provided by a Subject Matter Expert are theirs and have
> nothing associated with NordStar Pro.

**Documents to produce**, as pages in the app:

- Risk Disclaimer
- Privacy Policy
- Refund Policy
- Terms and Conditions
- **Affiliate Policy — net new.** The source pack has nothing covering people who promote
  the platform for commission: eligibility, commission terms, the holdback and approval,
  prohibited promotion (no income claims, no spam, no bidding on the brand), termination
  and clawback on refunded sales.

The pack also contains Regulatory Status, Conflicts of Interest and Complaints Handling,
which are not on the request list but are cheap to adapt and useful. See §4.

**Non-negotiable.** These are drafts for a qualified lawyer to review before publication.
Nothing generated here is legal advice, and the brief must not imply otherwise. The source
document says the same thing in its own first paragraph.

---

## 4. Decisions still needed

Ordered by how much they change the build.

**Cart**
1. Can a cart mix monthly and yearly items? *Recommendation: yes, and bill them as separate
   subscriptions behind one checkout — Stripe supports this; Cregis does not, so crypto may
   need one interval per order.*
2. Can a trial be added to a cart alongside a paid item? *Recommendation: no. A trial is a
   different act with its own eligibility rules, and mixing them makes both confusing.*
3. What happens when the cart contains something the buyer already holds? *Recommendation:
   refuse the line with a clear message, as the section checkout already does.*

**Affiliates**
4. Does an affiliate see **who** they introduced, or only counts? *Recommendation: counts,
   status and value only. Names and emails are the platform's customers, and handing over a
   contact list should be a deliberate contractual decision, not a dashboard default.*
5. Commission on the first payment only, or on every renewal? *Recommendation: make it a
   stored term per affiliate, like the expert share — the existing `AffiliateRewardKind`
   already anticipates several shapes.*
6. Attribution window and rule: how long does a referral cookie last, and does first click
   or last click win? *Recommendation: 30 days, last click, both stored on the `Referral`
   row so a dispute can be settled from data.*
7. Can affiliates self-register, or are they invited? *Recommendation: invited. Open
   affiliate registration on a financial platform attracts exactly the promotion the
   Affiliate Policy will prohibit.*

**Reviews**
8. Who may review — anyone, or only a member with a live entitlement to that section?
   *Recommendation: only entitled members, and say so on the review. A verified-buyer badge
   is the only thing that makes a rating worth reading.*
9. Moderated before display, or published and removable? *Recommendation: before. See §8.*
10. Can the expert reply? *Recommendation: yes, labelled as the expert, in a later phase.*
11. Does the star rating affect ordering or featured placement anywhere? *Recommendation:
    not initially. Ranking by rating invites gaming before there is enough volume for it to
    mean anything.*

**Trials**
12. Should existing sections be switched on when the default changes, or only new ones?
    *Recommendation: new ones only, plus a one-click "turn trials on everywhere" in the
    admin. A migration that silently starts giving away existing products is the kind of
    change that should be a decision, not a side effect.*

**Audience labels**
13. Rename the enum value `retail` → `starter`, or keep the value and change only the
    label? *Recommendation: change the label only. The value is written into rows already;
    renaming it is a data migration for a word nobody outside the admin sees.*

**Admin**
14. Should light mode apply to the whole site or only the admin console? *Recommendation:
    admin only for now. The marketing site's two-ground design is deliberate and a theme
    toggle across it is a design project, not a feature.*

**Legal**
15. Country of incorporation, company number, registered address, governing law, and the
    support/privacy email addresses.
16. Adapt the three extra documents — Regulatory Status, Conflicts of Interest, Complaints
    Handling? *Recommendation: yes. They are already drafted, they are cheap to adapt, and
    a complaints procedure is the kind of thing whose absence is noticed only when it is
    needed.*
17. Does the platform hold itself out as regulated anywhere, or is it explicitly
    unregulated? This determines the entire Regulatory Status page and must come from the
    lawyer, not from here.

**Money**
18. "Cashbacks" appear in the revenue definition but exist nowhere in the product. What is
    one — a promotional rebate to the buyer, a loyalty credit, something else? It cannot be
    deducted before it is defined.

---

## 5. Suggested sequencing

These nine items are **a quarter of work, not a sprint**. Items 1, 2 and 4 are multi-week
on their own. Suggested order, cheapest and least risky first:

| Phase | Work | Why here |
|---|---|---|
| **0** | Merge PR #80 | Several items build on the ledger; one reworks it. |
| **1** | Items 3, 5, 6, 7 | Small, self-contained, immediately useful. Admin sign out and larger text improve every session that follows. |
| **2** | Item 9, the legal pack | Independent of all the code. Can run in parallel, and the lawyer's turnaround is the long pole. |
| **3** | Item 4, cart and order lines | Reworks the order model, so everything downstream should sit on top of it rather than be rewritten after it. |
| **4** | Item 1, affiliate portal | Needs the ledger *and* the cart attribution. |
| **5** | Item 2, expert portal | Shares most of its machinery with the affiliate portal; second is much cheaper than first. |
| **6** | Item 8, reviews | Genuinely optional, and the moderation question deserves its own thought. |

---

## 6. Things the next session should check before starting

- `PR #80` merged, and `main` green.
- Whether `STRIPE_SECRET_KEY` has been set. Card payment is still unproven against a real
  Stripe account; everything in item 4 assumes it works.
- Whether Cregis supports third-party payouts. Still unanswered, and it decides whether
  affiliate and expert payouts can ever be automated.
- The tax question from the previous phase: whether the platform is self-registering for
  overseas VAT/GST or moving to a Merchant of Record. It changes checkout fundamentally,
  and a cart built before that decision may need redoing.
