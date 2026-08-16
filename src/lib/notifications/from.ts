/**
 * The address every member email is sent from.
 *
 * Defined here rather than inline in the Resend provider so the admin console and the
 * sender agree without the console importing a vendor module.
 *
 * The default is the real address, deliberately. It used to be Resend's shared sandbox
 * domain (`onboarding@resend.dev`), which delivers only to the account owner's own inbox
 * — so a deployment that enabled Resend but forgot `EMAIL_FROM` would report every send
 * as successful while no member received anything. Defaulting to the real address turns
 * that silent failure into a loud one: an unverified domain is rejected by the provider
 * with an error that says so, and the delivery log records the failure.
 *
 * `EMAIL_FROM` still wins when set, which is what lets a staging deployment send from
 * somewhere else.
 */
export const DEFAULT_EMAIL_FROM = 'NordStar Pro <team@fincoursa.com>'
