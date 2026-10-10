import 'server-only'

import { callbackIpAllowed, clientAddress } from '@/lib/cregis-callback'
import { resolveCregisSettings } from '@/lib/cregis-settings'
import { MissingConfigError } from '@/lib/env'
import { amountString } from '@/lib/package-shape'
import { cregisConfigured, createCheckout, verifyCregisCallback } from '@/lib/payments/cregis'
import type { PaymentProvider } from '@/lib/payments/types'

/** A Cregis callback body, parsed but otherwise as received. */
export type CregisCallback = Record<string, unknown>

/**
 * Crypto payments, through Cregis. One-off: each payment buys one period, stacked on any
 * time left, and nothing renews by itself — a crypto payment is a push with no stored
 * mandate behind it.
 */
export const cregisProvider: PaymentProvider<CregisCallback> = {
  id: 'cregis',
  label: 'Crypto',
  capabilities: { recurring: false, crypto: true, refunds: false, payouts: false },

  configured() {
    // Console settings first, then the environment — see cregis-settings.ts.
    return cregisConfigured()
  },

  canSell() {
    // Cregis charges whatever the call says, so there is no stored price to be missing.
    return null
  },

  async startCheckout({ orderId, email, lines, chargeCents }) {
    const result = await createCheckout({
      orderId,
      email,
      amount: amountString(chargeCents),
      currency: lines[0].item.currency,
      // Shown on the Cregis order page. One name, or a count — the lines are on our order.
      remark: lines.length === 1 ? lines[0].item.name : `${lines.length} items`,
    })
    return { checkoutUrl: result.checkoutUrl, providerRef: result.cregisOrderId }
  },

  async verifyWebhook(rawBody, headers) {
    let payload: CregisCallback
    try {
      payload = JSON.parse(rawBody)
    } catch {
      console.error('[cregis:webhook] rejected — body was not valid JSON')
      return { ok: false, status: 400, error: 'invalid payload' }
    }

    /*
     * Optional source-address allowlist, checked before the signature.
     *
     * Off unless an operator sets it, and that default is correct rather than lax: the
     * signature below is what actually authorises the callback, and Cregis has historically
     * called from a rotating pool of addresses. An incomplete allowlist would silently
     * reject real payments — the worst failure this system has — so it is opt-in, and the
     * console says as much beside the field.
     */
    try {
      const { callbackIps } = await resolveCregisSettings()
      const source = clientAddress(headers)
      if (!callbackIpAllowed(callbackIps.value, source)) {
        console.error(`[cregis:webhook] rejected — source ${source ?? 'unknown'} is not allowlisted`)
        return { ok: false, status: 403, error: 'source not allowed' }
      }
    } catch (error) {
      // A settings lookup failure must not silently open the gate, but it also must not
      // reject a real payment: the signature check below still stands on its own.
      console.error('[cregis:webhook] could not read the IP allowlist; continuing on signature', error)
    }

    try {
      if (!(await verifyCregisCallback(payload))) {
        // Never fall back to trusting the payload. An unverifiable callback is a hostile
        // callback as far as this rail is concerned.
        console.error('[cregis:webhook] rejected — signature verification failed')
        return { ok: false, status: 401, error: 'invalid signature' }
      }
    } catch (error) {
      if (error instanceof MissingConfigError) {
        console.error(
          `[cregis:webhook] REJECTED — ${error.message} No payment can be processed until real ` +
            `Cregis credentials are set. This callback was NOT actioned.`,
        )
        return { ok: false, status: 503, error: 'payment integration not configured' }
      }
      throw error
    }

    return { ok: true, event: payload }
  },
}
