/**
 * Builds the repeating diagonal watermark tile used across the reading views (§7).
 *
 * Shared rather than duplicated because the report page now has three surfaces that
 * need it — the rendered PDF pages, the black instrument bands and the white ones —
 * and a watermark that is present on two of the three is worse than none: it tells a
 * leaker exactly which surface to screenshot.
 *
 * The fill differs per surface for the same reason. #e9e7dd is invisible on white.
 */
export function watermarkTile(label: string, fill: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="200">` +
    `<text x="0" y="100" transform="rotate(-24 0 100)" font-family="monospace" font-size="14" ` +
    `fill="${fill}">${escapeXml(label)}</text></svg>`

  // `#` is not legal unescaped inside a url() data URI, so colours arrive as %23.
  return `url("data:image/svg+xml;utf8,${svg.replace(/#/g, '%23')}")`
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
