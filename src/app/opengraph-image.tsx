import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'NordStar Pro — Technical and macro market research'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * The preview card shown when any page is shared on LinkedIn, X or in a message.
 *
 * Drawn in code rather than shipped as a PNG for the same reason the wordmark is set in
 * CSS (docs/brand/README.md): there is no image file to drift out of date. The fonts are
 * the renderer's default rather than Satoshi — fetching Fontshare at the edge on every
 * share would make the card slow or blank whenever that CDN is — so the mark keeps its
 * colours and proportions, not its typeface.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#000000',
          color: '#FFFFFF',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
          <span style={{ fontSize: 64, fontWeight: 500, letterSpacing: '-0.025em' }}>NordStar</span>
          <span style={{ fontSize: 36, letterSpacing: '0.22em', color: '#D6FD3A' }}>PRO</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <span style={{ fontSize: 58, lineHeight: 1.1, maxWidth: 940 }}>
            Independent technical and macro research
          </span>
          <span style={{ fontSize: 28, color: '#9CA3AF' }}>
            Commodities · FX · Global indices · Options and crypto
          </span>
        </div>
      </div>
    ),
    size,
  )
}
