# Onboarding a new customer over WhatsApp

Short version: **send people to a trial, not to checkout.** The two paths are not equally
easy, and the difference is in the code rather than in the sales pitch.

## Why the trial path is the one to use

`/trial?item=<slug>` → they enter an email, a first name and a password → the account is
created, a session is started and they are reading. One step. No card, no access code, no
email has to arrive for it to work. `src/app/api/trial/route.ts` signs them in on the spot
rather than sending them to a login form to retype the password they just chose.

`/join?package=<slug>` → they pay → an access code is emailed → they open `/redeem` → the
account is created. **Two steps, and the second one depends on an email arriving.** Every
message below that points at checkout therefore warns about the code, because that is where
a paying customer gets stuck — they have already paid, so from their side nothing appears to
have happened.

So: cold or undecided, send the trial link. Already decided, send the checkout link and
prepare them for the code.

This only works for a subject with a trial actually open — Admin → Sections → **Start a
trial** on that section's row. Without one, `/trial` refuses everybody, and a link to a page
that refuses everybody is worse than no link.

## Getting the link right

| Who | Link |
|---|---|
| One subject, free trial | `https://nordstarpro.com/trial?item=<item-slug>` |
| A package, free trial | `https://nordstarpro.com/trial?item=package:<package-slug>` |
| Straight to payment | `https://nordstarpro.com/join?package=<package-slug>` |
| An expert's page | `https://nordstarpro.com/experts/<author-slug>` |

The section's item slug is the section slug — visible in Admin → Sections under the name,
as `/crude-oil-price-forecasting-by-dean-rogers`.

## The messages

WhatsApp formatting is `*bold*`, `_italic_`, `~strikethrough~`. No HTML, no links with
display text — the URL shows as itself, so it should look respectable on its own.

Keep each one under about 400 characters. Past that WhatsApp collapses it behind
"Read more", and a sales message nobody expands is a sales message nobody read. **One link
per message**: two or more reads as bulk sending, both to the recipient and to WhatsApp.

---

### 1. Someone who enquired — the standard one

> Hi {{FIRST_NAME}} — thanks for asking about NordStar Pro.
>
> You can read *{{SUBJECT}}* free for {{DAYS}} days. No card, and it stops by itself, so
> there's nothing to cancel.
>
> {{TRIAL_LINK}}
>
> Takes a minute — your email and a password, then you're straight into it. Any questions,
> just reply here.
>
> — {{SENDER_NAME}}, NordStar Pro

### 2. Someone who has already decided to buy

> Hi {{FIRST_NAME}} — here's the link for *{{PACKAGE_NAME}}*, {{PRICE}} a month:
>
> {{JOIN_LINK}}
>
> Card or crypto both work. Once it confirms you'll get an *access code by email* — that's
> what sets up your account, so do look out for it, and check spam if it's slow.
>
> Any trouble with it, message me here and I'll sort it.

The access-code sentence is the point of this message. Leave it out and a customer who has
paid sits waiting for something to happen.

### 3. A nudge, a few days into a trial

> Hi {{FIRST_NAME}} — your trial runs until {{END_DATE}}, and {{AUTHOR_NAME}} published
> *{{REPORT_TITLE}}* this week.
>
> {{PORTAL_LINK}}
>
> Worth a look before it lapses. If it isn't for you, no need to do anything — it stops on
> its own.

### 4. Answering "what do I actually get?"

> {{AUTHOR_NAME}} covers *{{SUBJECT}}*, {{CADENCE}}. You get every edition as it's
> published, the full archive of what came before, and an email the moment each one lands.
> {{PRICE}} a month, cancel whenever.
>
> His page, with a sample of the work: {{EXPERT_LINK}}

## Two things to be careful about

**Sending to people who did not ask.** Through the WhatsApp Business API, a message to
somebody outside a 24-hour customer-service window has to be a pre-approved template, and
sending cold marketing gets numbers banned rather than warned. Replying to an enquiry is
fine; buying a list is not.

**The tone of the site.** Every other surface avoids exclamation marks, urgency and emoji.
A WhatsApp message that sounds like a different company undoes the thing the research is
selling, which is sobriety.
