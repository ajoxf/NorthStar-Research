import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { formatBytes, isReportBlobUrl, slugify } from '@/lib/report-upload'

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
