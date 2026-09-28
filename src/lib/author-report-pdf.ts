import 'server-only'

import type { AuthorWeek } from '@/lib/author-report'

/**
 * The author's weekly figures, as a PDF.
 *
 * Built with pdf-lib and its built-in Helvetica rather than the site's own typefaces.
 * Satoshi is fetched from Fontshare at runtime and is not vendored here, so embedding it
 * would mean a network call inside a request that must not depend on a third party being
 * reachable — and a report that sometimes fails to generate is worse than one set in a
 * plain face.
 *
 * **Laid out as a document, not a dump.** An author reads this in under a minute and acts
 * on one number in it, so the order is deliberate: how the week went, then where it is
 * going, then what it is made of, then what was published. Anything needing a paragraph
 * of explanation — the all-access readers, what "lapsed" counts — carries that
 * explanation on the page rather than assuming a covering email that may not be written.
 *
 * Imported lazily by the route: pdf-lib is large and most admin requests never touch it.
 */

/** A4 in points, portrait. */
const PAGE = { width: 595.28, height: 841.89 }
const MARGIN = 52

const INK = [0.067, 0.094, 0.153] as const // #111827
const DIM = [0.42, 0.45, 0.5] as const
const RULE = [0.85, 0.86, 0.88] as const
const WASH = [0.957, 0.961, 0.965] as const // #f4f5f6
const UP = [0.13, 0.47, 0.27] as const
const DOWN = [0.65, 0.18, 0.18] as const

function day(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function shortDay(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export async function authorWeekPdf(week: AuthorWeek): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

  const doc = await PDFDocument.create()
  doc.setTitle(`${week.authorName} — subscribers, week to ${day(week.to)}`)
  doc.setAuthor('NordStar Pro')
  doc.setCreator('NordStar Pro')
  doc.setSubject('Weekly subscriber report')

  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const page = doc.addPage([PAGE.width, PAGE.height])
  const RIGHT = PAGE.width - MARGIN
  const WIDTH = RIGHT - MARGIN
  let y = PAGE.height - MARGIN

  const write = (
    value: string,
    o: { size?: number; bold?: boolean; colour?: readonly number[]; x?: number; y?: number } = {},
  ) => {
    const c = o.colour ?? INK
    page.drawText(value, {
      x: o.x ?? MARGIN,
      y: o.y ?? y,
      size: o.size ?? 10,
      font: o.bold ? bold : regular,
      color: rgb(c[0], c[1], c[2]),
    })
  }

  const rule = (at = y) =>
    page.drawLine({
      start: { x: MARGIN, y: at },
      end: { x: RIGHT, y: at },
      thickness: 0.75,
      color: rgb(RULE[0], RULE[1], RULE[2]),
    })

  /** A section heading. Returns nothing; moves the cursor. */
  const heading = (label: string) => {
    write(label, { size: 8.5, bold: true, colour: DIM })
    y -= 7
    rule()
    y -= 18
  }

  // Trim to the column it has to sit in, rather than wrapping: a wrapped cell would push
  // the figures beside it out of line with their own headings.
  const fit = (value: string, size: number, max: number, font = regular) => {
    if (font.widthOfTextAtSize(value, size) <= max) return value
    let cut = value
    while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > max) cut = cut.slice(0, -1)
    return `${cut}…`
  }

  // ---- Masthead ----------------------------------------------------------------
  write('NORDSTAR PRO', { size: 8.5, bold: true, colour: DIM })
  write(`Week of ${shortDay(week.from)} – ${shortDay(week.to)}`, {
    size: 8.5,
    colour: DIM,
    x: RIGHT - regular.widthOfTextAtSize(`Week of ${shortDay(week.from)} – ${shortDay(week.to)}`, 8.5),
  })
  y -= 28
  write(week.authorName, { size: 21, bold: true })
  y -= 15
  write('Your subscribers this week', { size: 10.5, colour: DIM })
  y -= 12
  rule()
  y -= 30

  // ---- The three figures -------------------------------------------------------
  const headline: [string, number][] = [
    ['New this week', week.totals.started],
    ['Lapsed this week', week.totals.lapsed],
    ['Subscribers now', week.totals.live],
  ]
  const column = WIDTH / 3
  headline.forEach(([label, value], i) => {
    const x = MARGIN + i * column
    write(String(value), { size: 30, bold: true, x, y })
    write(label, { size: 8.5, colour: DIM, x, y: y - 14 })
  })
  y -= 40

  /*
   * Net movement, said in words rather than as a signed number.
   *
   * "+3" and "−3" differ by one character and are read at a glance by somebody scanning
   * for good news. Spelling it out removes the chance of a bad week being taken for a
   * good one, which is the single most damaging way this document could be misread.
   */
  const netLine =
    week.net > 0
      ? `Up ${week.net} on the week.`
      : week.net < 0
        ? `Down ${Math.abs(week.net)} on the week.`
        : 'No net change on the week.'
  write(netLine, { size: 11, bold: true, colour: week.net > 0 ? UP : week.net < 0 ? DOWN : INK })
  if (week.weekOnWeek !== null && week.weekOnWeek !== week.net) {
    const w = week.weekOnWeek
    write(
      `Total subscribers ${w > 0 ? 'up' : w < 0 ? 'down' : 'level'}${w === 0 ? '' : ` ${Math.abs(w)}`} against last week.`,
      { size: 9, colour: DIM, x: MARGIN + 150 },
    )
  }
  y -= 30

  // ---- Trend -------------------------------------------------------------------
  if (week.history.length > 1) {
    heading(`SUBSCRIBERS, LAST ${week.history.length} WEEKS`)

    const chartH = 78
    const top = y
    const bottom = y - chartH
    const peak = Math.max(1, ...week.history.map((p) => p.live))
    const slot = WIDTH / week.history.length
    const barW = Math.min(30, slot * 0.5)

    // A baseline, so a run of zero weeks is visibly zero rather than visibly missing.
    page.drawLine({
      start: { x: MARGIN, y: bottom },
      end: { x: RIGHT, y: bottom },
      thickness: 0.75,
      color: rgb(RULE[0], RULE[1], RULE[2]),
    })

    week.history.forEach((point, i) => {
      const x = MARGIN + i * slot + (slot - barW) / 2
      const h = (point.live / peak) * chartH
      const last = i === week.history.length - 1
      if (h > 0) {
        page.drawRectangle({
          x,
          y: bottom,
          width: barW,
          height: h,
          // The current week in ink, the history in a wash: the eye should land on the
          // week the report is about without reading an axis to find it.
          color: last ? rgb(INK[0], INK[1], INK[2]) : rgb(0.78, 0.80, 0.83),
        })
      }
      write(String(point.live), {
        size: 8,
        bold: last,
        colour: last ? INK : DIM,
        x: x + barW / 2 - regular.widthOfTextAtSize(String(point.live), 8) / 2,
        y: bottom + h + 5,
      })
      write(shortDay(point.to), {
        size: 7.5,
        colour: DIM,
        x: x + barW / 2 - regular.widthOfTextAtSize(shortDay(point.to), 7.5) / 2,
        y: bottom - 11,
      })
    })

    y = bottom - 30
    void top
  }

  // ---- By subject --------------------------------------------------------------
  heading('BY SUBJECT')
  const cols = [MARGIN, RIGHT - 210, RIGHT - 140, RIGHT - 70]
  const numAt = (x: number, value: string, size = 10, isBold = false) =>
    write(value, {
      size,
      bold: isBold,
      x: x + 44 - (isBold ? bold : regular).widthOfTextAtSize(value, size),
    })

  write('Subject', { size: 8.5, bold: true, colour: DIM })
  ;['New', 'Lapsed', 'Now'].forEach((label, i) =>
    write(label, {
      size: 8.5,
      bold: true,
      colour: DIM,
      x: cols[i + 1] + 44 - bold.widthOfTextAtSize(label, 8.5),
    }),
  )
  y -= 15

  if (week.sections.length === 0) {
    write('No subjects are on sale under this name yet.', { size: 10, colour: DIM })
    y -= 18
  }

  week.sections.forEach((section, i) => {
    if (i % 2 === 1) {
      page.drawRectangle({
        x: MARGIN - 4,
        y: y - 4,
        width: WIDTH + 8,
        height: 16,
        color: rgb(WASH[0], WASH[1], WASH[2]),
      })
    }
    write(fit(section.name, 10, cols[1] - MARGIN - 12), { size: 10 })
    numAt(cols[1], String(section.started))
    numAt(cols[2], String(section.lapsed))
    numAt(cols[3], String(section.live), 10, true)
    y -= 17
  })

  y -= 6
  rule()
  y -= 16
  write('Total', { size: 10, bold: true })
  numAt(cols[1], String(week.totals.started), 10, true)
  numAt(cols[2], String(week.totals.lapsed), 10, true)
  numAt(cols[3], String(week.totals.live), 10, true)
  y -= 30

  // ---- Composition and what is coming ------------------------------------------
  heading('WHAT YOUR SUBSCRIBERS ARE MADE OF')
  const parts: [string, number][] = [
    ['Card, renews itself', week.composition.card],
    ['Crypto, renewed by hand', week.composition.crypto],
    ['Access code', week.composition.code],
    ['Comped, open-ended', week.composition.comp],
  ]
  parts.forEach(([label, value], i) => {
    const x = MARGIN + (i % 2) * (WIDTH / 2)
    const row = Math.floor(i / 2)
    write(`${value}`, { size: 12, bold: true, x, y: y - row * 18 })
    write(label, { size: 9.5, colour: DIM, x: x + 22, y: y - row * 18 })
  })
  y -= 46

  /*
   * The most actionable line in the document, so it is given its own band.
   *
   * These subscriptions will either renew or lapse within the month, and the weeks before
   * that is the only window in which an author can do anything about it.
   */
  page.drawRectangle({
    x: MARGIN - 6,
    y: y - 8,
    width: WIDTH + 12,
    height: 28,
    color: rgb(WASH[0], WASH[1], WASH[2]),
  })
  write(
    week.renewalsDue === 0
      ? 'Nothing is due to renew in the next 30 days.'
      : `${week.renewalsDue} subscription${week.renewalsDue === 1 ? '' : 's'} due to renew in the next 30 days.`,
    { size: 10.5, bold: true, y: y + 2 },
  )
  y -= 38

  // ---- Published this week -----------------------------------------------------
  heading('PUBLISHED THIS WEEK')
  if (week.reports.length === 0) {
    write('Nothing published in this period.', { size: 10, colour: DIM })
    y -= 18
  } else {
    write('Opens', {
      size: 8.5,
      bold: true,
      colour: DIM,
      x: RIGHT - bold.widthOfTextAtSize('Opens', 8.5),
    })
    y -= 15
    for (const report of week.reports.slice(0, 8)) {
      write(fit(report.title, 10, WIDTH - 90), { size: 10 })
      write(String(report.opens), {
        size: 10,
        x: RIGHT - regular.widthOfTextAtSize(String(report.opens), 10),
      })
      y -= 13
      write(shortDay(report.publishedAt), { size: 8, colour: DIM })
      y -= 15
    }
  }
  y -= 6
  write(`${week.reads} total opens across all your editions this week.`, {
    size: 9.5,
    colour: DIM,
  })
  y -= 26

  /*
   * The all-access figure, and why it is here at all.
   *
   * Most members currently read every subject on the legacy all-access membership without
   * holding any one of them. Left out, an author with a real readership is told nobody
   * reads them; added in, the desk overstates what they have sold. So it is stated
   * separately, with the reason, rather than folded into either number above.
   */
  if (week.allAccessReaders > 0) {
    write(
      `A further ${week.allAccessReaders} member${week.allAccessReaders === 1 ? '' : 's'} can read your work on the all-access membership.`,
      { size: 10 },
    )
    y -= 13
    write('Not counted above: they did not subscribe to you directly.', {
      size: 8.5,
      colour: DIM,
    })
  }

  /*
   * Definitions, pinned to the foot.
   *
   * An outside reader has no way to check what these words mean, and the two that matter
   * are both counter-intuitive: "new" excludes renewals, and "lapsed" excludes access the
   * desk stopped by hand. Without this the same figures get read as something else.
   */
  const notes = [
    `Week of ${day(week.from)} to ${day(week.to)}.`,
    'New: first-time subscriptions to your subjects. Renewals are not counted as new.',
    'Lapsed: a subscription that ran out in the week and was not renewed.',
    'Subscribers now: those holding one of your subjects at the close of the week.',
  ]
  let noteY = MARGIN + (notes.length - 1) * 10
  rule(noteY + 16)
  for (const note of notes) {
    write(note, { size: 7.5, colour: DIM, y: noteY })
    noteY -= 10
  }

  return doc.save()
}
