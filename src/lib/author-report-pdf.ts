import 'server-only'

import type { AuthorWeek } from '@/lib/author-report'

/**
 * The author's weekly figures, as a PDF.
 *
 * Built with pdf-lib and its built-in Helvetica rather than the site's own typefaces.
 * Satoshi is fetched from Fontshare at runtime and is not vendored here, so embedding it
 * would mean a network call inside a request that must not depend on a third party being
 * reachable — and a report that sometimes fails to generate is worse than one set in a
 * plain face. This is a statement of numbers, not a brand artefact.
 *
 * Imported lazily by the route for the same reason `pdf-compress` is: pdf-lib is large
 * and most admin requests never touch it.
 */

/** A4 in points, portrait. */
const PAGE = { width: 595.28, height: 841.89 }
const MARGIN = 56

const INK = { r: 0.067, g: 0.094, b: 0.153 } // #111827
const DIM = { r: 0.42, g: 0.45, b: 0.5 }
const RULE = { r: 0.85, g: 0.86, b: 0.88 }

function formatDay(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export async function authorWeekPdf(week: AuthorWeek): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

  const doc = await PDFDocument.create()
  doc.setTitle(`${week.authorName} — subscribers, week to ${formatDay(week.to)}`)
  doc.setAuthor('NordStar Pro')
  doc.setCreator('NordStar Pro')

  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const page = doc.addPage([PAGE.width, PAGE.height])
  let y = PAGE.height - MARGIN

  const text = (
    value: string,
    opts: { size?: number; font?: typeof regular; colour?: typeof INK; x?: number } = {},
  ) => {
    const size = opts.size ?? 11
    page.drawText(value, {
      x: opts.x ?? MARGIN,
      y,
      size,
      font: opts.font ?? regular,
      color: rgb((opts.colour ?? INK).r, (opts.colour ?? INK).g, (opts.colour ?? INK).b),
    })
  }

  const rule = () => {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE.width - MARGIN, y },
      thickness: 0.75,
      color: rgb(RULE.r, RULE.g, RULE.b),
    })
  }

  text('NORDSTAR PRO', { size: 9, font: bold, colour: DIM })
  y -= 26
  text(week.authorName, { size: 22, font: bold })
  y -= 16
  text(`Subscribers — week to ${formatDay(week.to)}`, { size: 11, colour: DIM })
  y -= 10
  rule()
  y -= 30

  // The three figures that answer "how did the week go", before any detail.
  const headline: [string, string][] = [
    ['New this week', String(week.totals.started)],
    ['Lapsed this week', String(week.totals.lapsed)],
    ['Subscribers at week end', String(week.totals.live)],
  ]
  let x = MARGIN
  const column = (PAGE.width - MARGIN * 2) / 3
  for (const [label, value] of headline) {
    page.drawText(value, { x, y, size: 28, font: bold, color: rgb(INK.r, INK.g, INK.b) })
    page.drawText(label, {
      x,
      y: y - 16,
      size: 9,
      font: regular,
      color: rgb(DIM.r, DIM.g, DIM.b),
    })
    x += column
  }
  y -= 48

  /*
   * Net movement, said in words.
   *
   * "+3" and "-3" differ by one character and are read at a glance by somebody scanning
   * for good news. Spelling it out removes the chance of a bad week being taken for a
   * good one.
   */
  const net =
    week.net > 0
      ? `Up ${week.net} on the week.`
      : week.net < 0
        ? `Down ${Math.abs(week.net)} on the week.`
        : 'No net change on the week.'
  text(net, { size: 11, font: bold })
  y -= 34

  text('BY SUBJECT', { size: 9, font: bold, colour: DIM })
  y -= 8
  rule()
  y -= 18

  const cols = [MARGIN, PAGE.width - MARGIN - 240, PAGE.width - MARGIN - 150, PAGE.width - MARGIN - 60]
  page.drawText('Subject', { x: cols[0], y, size: 9, font: bold, color: rgb(DIM.r, DIM.g, DIM.b) })
  for (const [i, label] of ['New', 'Lapsed', 'Now'].entries()) {
    page.drawText(label, {
      x: cols[i + 1],
      y,
      size: 9,
      font: bold,
      color: rgb(DIM.r, DIM.g, DIM.b),
    })
  }
  y -= 16

  if (week.sections.length === 0) {
    text('No subjects are on sale under this name yet.', { size: 11, colour: DIM })
    y -= 20
  }

  for (const section of week.sections) {
    // Truncated rather than wrapped: a subject name long enough to wrap would push the
    // figures out of line with their own headings, which is worse than an ellipsis.
    const name =
      section.name.length > 46 ? `${section.name.slice(0, 45)}…` : section.name
    page.drawText(name, { x: cols[0], y, size: 11, font: regular, color: rgb(INK.r, INK.g, INK.b) })
    for (const [i, value] of [section.started, section.lapsed, section.live].entries()) {
      page.drawText(String(value), {
        x: cols[i + 1],
        y,
        size: 11,
        font: regular,
        color: rgb(INK.r, INK.g, INK.b),
      })
    }
    y -= 18
  }

  y -= 14
  rule()
  y -= 24

  text('ALSO THIS WEEK', { size: 9, font: bold, colour: DIM })
  y -= 18
  text(
    `${week.reportsPublished} report${week.reportsPublished === 1 ? '' : 's'} published · ` +
      `${week.reads} open${week.reads === 1 ? '' : 's'} by members`,
    { size: 11 },
  )
  y -= 28

  /*
   * The all-access figure, and why it is here at all.
   *
   * Most members currently read every subject on the legacy all-access membership without
   * holding any one of them. Left out, an author with a real readership is told nobody
   * reads them; added in, the desk overstates what they have sold. So it is stated
   * separately, with the reason, rather than folded into either number above.
   */
  if (week.allAccessReaders > 0) {
    text(
      `A further ${week.allAccessReaders} member${week.allAccessReaders === 1 ? '' : 's'} ` +
        `can read your work on the all-access membership.`,
      { size: 11 },
    )
    y -= 15
    text('They are not counted above, because they did not subscribe to you directly.', {
      size: 9,
      colour: DIM,
    })
    y -= 26
  }

  // Footer, pinned to the page rather than following the flow above it.
  page.drawText(
    `Week of ${formatDay(week.from)} to ${formatDay(week.to)}. Figures are subscriptions to ` +
      `your subjects, counted at week end.`,
    { x: MARGIN, y: MARGIN, size: 8, font: regular, color: rgb(DIM.r, DIM.g, DIM.b) },
  )

  return doc.save()
}
