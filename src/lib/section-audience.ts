/**
 * What a section's audience is called, wherever anybody can read it.
 *
 * The stored value `retail` is shown as **Starter**. The value itself is unchanged on
 * purpose: it is already written into rows, and renaming an enum value is a data
 * migration for a word nobody outside the code ever sees. Everything a person reads goes
 * through this one table, so the next rename is one line.
 */
export const SECTION_AUDIENCES = ['retail', 'institutional'] as const
export type SectionAudience = (typeof SECTION_AUDIENCES)[number]

export const SECTION_AUDIENCE_LABEL: Record<SectionAudience, string> = {
  retail: 'Starter',
  institutional: 'Institutional',
}

/** The label for a stored value, or the value itself for one this table does not know. */
export function sectionAudienceLabel(value: string): string {
  return SECTION_AUDIENCE_LABEL[value as SectionAudience] ?? value
}
