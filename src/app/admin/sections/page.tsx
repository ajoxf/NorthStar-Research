import type { Metadata } from 'next'

import { AuthorManager } from '@/app/admin/sections/author-manager'
import { SectionManager } from '@/app/admin/sections/section-manager'
import { TopicManager } from '@/app/admin/sections/topic-manager'
import { VisibilityToggle } from '@/app/admin/sections/visibility-toggle'
import { RepairPanel } from '@/app/admin/sections/repair-panel'
import { ToastProvider } from '@/components/ui/toast'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { sectionsPublic } from '@/lib/sections-mode'

export const metadata: Metadata = { title: 'Sections', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Topics, authors and the sections they combine into.
 *
 * One page rather than three, because the three are only meaningful together: a topic
 * with no author sells nothing, an author with no section is a profile page nobody can
 * subscribe to, and the operator setting this up for the first time is doing all three in
 * one sitting. The order down the page is the order the work happens in.
 */
export default async function AdminSectionsPage() {
  await requireAdmin()

  const [visible, topics, authors, sections, unlinked] = await Promise.all([
    sectionsPublic(),
    db.topic.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { sections: true } } },
    }),
    db.author.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { sections: true } } },
    }),
    db.section.findMany({
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
      include: {
        topic: true,
        author: true,
        // The trial lives on the item, so the switch on this screen needs it.
        item: { select: { slug: true, trialEnabled: true, trialDays: true } },
        _count: { select: { reports: true, entitlements: true } },
      },
    }),
    // Sections that cannot be put in a package. Counted here so the repair panel appears
    // exactly when there is something to repair, rather than sitting on a healthy screen.
    db.section.count({ where: { itemId: null } }),
  ])

  const live = sections.filter((section) => section.archivedAt === null).length

  return (
    <ToastProvider>
      <div className="mx-auto max-w-5xl px-5 py-12">
        <div className="mb-8">
          <span className="eyebrow">Experts &amp; coverage</span>
          <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Sections</h1>
          <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-dim">
            A section is one topic by one author — &ldquo;Energy by Sarah Chen&rdquo; — and it is
            the thing a member subscribes to. One author per section on purpose: every payment
            then belongs to one person, so there is no split to agree.
            {live > 0 && ` ${live} section${live === 1 ? '' : 's'} set up so far.`}
          </p>
          <VisibilityToggle visible={visible} ready={live > 0} />
        </div>

        <RepairPanel unlinked={unlinked} />

        <TopicManager
          topics={topics.map((topic) => ({
            id: topic.id,
            name: topic.name,
            slug: topic.slug,
            blurb: topic.blurb,
            sortOrder: topic.sortOrder,
            archived: topic.archivedAt !== null,
            sectionCount: topic._count.sections,
          }))}
        />

        <AuthorManager
          authors={authors.map((author) => ({
            id: author.id,
            name: author.name,
            slug: author.slug,
            headline: author.headline,
            bio: author.bio,
            photoUrl: author.photoUrl,
            websiteUrl: author.websiteUrl,
            linkedinUrl: author.linkedinUrl,
            xUrl: author.xUrl,
            credentials: author.credentials,
            sortOrder: author.sortOrder,
            comingSoon: author.comingSoon,
            archived: author.archivedAt !== null,
            sectionCount: author._count.sections,
          }))}
        />

        <SectionManager
          topics={topics
            .filter((topic) => topic.archivedAt === null)
            .map((t) => ({ id: t.id, name: t.name }))}
          authors={authors
            .filter((author) => author.archivedAt === null)
            .map((a) => ({ id: a.id, name: a.name }))}
          sections={sections.map((section) => ({
            id: section.id,
            slug: section.slug,
            displayName: section.displayName,
            description: section.description,
            topic: { name: section.topic.name },
            author: { name: section.author.name },
            priceCents: section.priceCents,
            currency: section.currency,
            interval: section.interval,
            sortOrder: section.sortOrder,
            imageUrl: section.imageUrl,
            itemSlug: section.item?.slug ?? null,
            trialEnabled: section.item?.trialEnabled ?? false,
            trialDays: section.item?.trialDays ?? null,
            archived: section.archivedAt !== null,
            reportCount: section._count.reports,
            subscriberCount: section._count.entitlements,
          }))}
        />
      </div>
    </ToastProvider>
  )
}
