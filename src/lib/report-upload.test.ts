import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { formatBytes, isReportBlobUrl, looksLikePdf, slugify } from '@/lib/report-upload'

describe('isReportBlobUrl', () => {
  it('accepts a Vercel Blob URL under the reports prefix', () => {
    assert.equal(
      isReportBlobUrl('https://abc123.public.blob.vercel-storage.com/reports/gold-9xK2.pdf'),
      true,
    )
  })

  it('rejects a blob URL outside the reports area', () => {
    // A token is only ever minted for reports/, so anything else did not come from us.
    assert.equal(
      isReportBlobUrl('https://abc123.public.blob.vercel-storage.com/invoices/secret.pdf'),
      false,
    )
  })

  it('rejects a look-alike host', () => {
    assert.equal(
      isReportBlobUrl('https://public.blob.vercel-storage.com.evil.test/reports/x.pdf'),
      false,
    )
  })

  it('rejects plain http', () => {
    assert.equal(
      isReportBlobUrl('http://abc123.public.blob.vercel-storage.com/reports/x.pdf'),
      false,
    )
  })

  it('rejects anything that is not a URL', () => {
    assert.equal(isReportBlobUrl('reports/x.pdf'), false)
    assert.equal(isReportBlobUrl(''), false)
  })
})

describe('slugify', () => {
  it('makes a title safe for a storage path', () => {
    assert.equal(slugify('Gold holds the weekly pivot'), 'gold-holds-the-weekly-pivot')
  })

  it('never returns an empty string', () => {
    // An all-punctuation title would otherwise produce `reports/.pdf`.
    assert.equal(slugify('!!!'), 'report')
    assert.equal(slugify(''), 'report')
  })
})

describe('formatBytes', () => {
  it('reports megabytes for a real report', () => {
    assert.equal(formatBytes(14_904_517), '14.2 MB')
  })

  it('falls back to kilobytes for a small file', () => {
    assert.equal(formatBytes(4_096), '4 KB')
  })
})

describe('looksLikePdf', () => {
  const serve = (body: Uint8Array | null, ok = true) =>
    (globalThis.fetch = (async () =>
      ok
        ? { ok: true, arrayBuffer: async () => body!.buffer }
        : { ok: false }) as unknown as typeof fetch)

  const original = globalThis.fetch
  const restore = () => {
    globalThis.fetch = original
  }

  it('accepts a real PDF header', async () => {
    serve(new TextEncoder().encode('%PDF-1.7\n'))
    assert.equal(await looksLikePdf('https://x.public.blob.vercel-storage.com/reports/a.pdf'), 'pdf')
    restore()
  })

  it('rejects a Word file renamed to .pdf', async () => {
    // A .docx is a zip: it starts PK\x03\x04. This is the case every name-based check
    // upstream lets through, because the browser derives the type from the extension.
    serve(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]))
    assert.equal(
      await looksLikePdf('https://x.public.blob.vercel-storage.com/reports/a.pdf'),
      'not-pdf',
    )
    restore()
  })

  it('rejects a file too short to have a header', async () => {
    serve(new Uint8Array([0x25, 0x50]))
    assert.equal(
      await looksLikePdf('https://x.public.blob.vercel-storage.com/reports/a.pdf'),
      'not-pdf',
    )
    restore()
  })

  it('says unknown when the store cannot be reached, so a good report still publishes', async () => {
    serve(null, false)
    assert.equal(
      await looksLikePdf('https://x.public.blob.vercel-storage.com/reports/a.pdf'),
      'unknown',
    )
    restore()
  })

  it('says unknown when the fetch throws rather than calling it a bad file', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    assert.equal(
      await looksLikePdf('https://x.public.blob.vercel-storage.com/reports/a.pdf'),
      'unknown',
    )
    restore()
  })
})
