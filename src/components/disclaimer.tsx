import Link from 'next/link'

/**
 * PENDING CLIENT INPUT — production domain.
 *
 * The disclaimer must name the one domain through which official services are offered.
 * Until the real domain is confirmed this default stands in; change it here and it
 * updates the footer, the /disclaimer page and the FAQs together.
 */
export const SITE_DOMAIN = 'northstarresearch.com'

/**
 * Section 8 disclaimer, verbatim. Do not shorten, paraphrase or re-order this copy —
 * only the NorthStar-specific substitutions already present are permitted.
 */
export function DisclaimerText({ className }: { className?: string }) {
  return (
    <div className={className}>
      <p>
        All content, trading ideas, signals, setups, open positions, and closed positions on the
        NorthStar Research website are for educational and informational purposes only. They should
        not be construed as financial advice or recommendations to buy or sell any security or
        specific assets.
      </p>
      <p>
        Trading in financial markets, including day trading, swing trading, and AI-assisted trading,
        involves substantial risk and is not suitable for every investor. Past performance is not
        indicative of future results. NorthStar Research makes no representation, promise, or
        guarantee of any specific outcome or profit.
      </p>
      <p>
        Any decision to follow these setups or signals is entirely at your own risk, and you are
        solely responsible for your actions and all investment decisions. All users are advised to
        consult with a qualified, licensed financial advisor before making any investment decisions.
        Your decisions should be based on your own evaluation of your financial circumstances,
        investment objectives, and risk tolerance. Always conduct your research and consider your
        risk tolerance.
      </p>
      <p>
        <strong className="text-ink">Online Safety Notice:</strong> NorthStar Research and its
        analysts will never contact you privately to request money, offer account management, or
        provide trading services through WhatsApp, Telegram, Discord, or social media direct
        messages. All official services are available exclusively through {SITE_DOMAIN}.
      </p>
      <p>
        Please be aware that there may be errors, omissions, or delays in the information provided.
        The positions listed are not guaranteed for accuracy, and there is no guarantee that our
        professional analysts are personally entering every position shared. These are trade ideas
        and signals and should be treated as such.
      </p>
      <p>
        NorthStar Research, its employees, and associates are not liable for your trading outcomes.
        For more details, read our{' '}
        <Link href="/privacy-policy" className="text-accent underline underline-offset-4">
          Privacy Policy
        </Link>{' '}
        and{' '}
        <Link href="/faqs" className="text-accent underline underline-offset-4">
          FAQs
        </Link>
        .
      </p>
    </div>
  )
}
