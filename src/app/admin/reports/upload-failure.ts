'use client'

/**
 * Turn a Blob upload failure into something an operator can act on.
 *
 * The client library collapses every token problem into one opaque sentence — "Failed to
 * retrieve the client token" — which names neither the cause nor the fix. This re-asks our
 * own token endpoint and prefers the reason it gives: storage unconfigured, a session that
 * expired mid-upload, a file the handler refused.
 *
 * Shared by the create form and the attach control on the report screen. It was written
 * for the first and copied nowhere, which is how the second screen ended up with no upload
 * at all; keeping one copy means the two cannot drift into explaining the same failure two
 * different ways.
 */
export async function explainUploadFailure(error: unknown): Promise<string> {
  try {
    const response = await fetch('/api/admin/reports/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = await response.json().catch(() => null)

    if (response.status === 403) {
      return 'Your admin session has expired. Sign in again, then re-upload the PDF.'
    }
    if (data?.error) return data.error
  } catch {
    // The probe itself failed, which usually means the connection dropped.
  }

  return error instanceof Error
    ? `The PDF could not be uploaded: ${error.message}`
    : 'The PDF could not be uploaded.'
}
