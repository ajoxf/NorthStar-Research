/**
 * Seed demo content for local development and client walkthroughs.
 *
 *   npm run seed-demo
 *
 * Creates one member, one unused redemption code, and three published reports (one of
 * each type) with populated instrument tables. Safe to re-run — everything is upserted
 * by a stable key. Never run this against production data.
 */
import { PrismaClient, type ReportType } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

const DEMO_PASSWORD = 'northstar-demo-2026'

const REPORTS: { type: ReportType; title: string; summary: string; instruments: unknown }[] = [
  {
    type: 'commodities',
    title: 'Gold defends the weekly pivot as energy rolls over',
    summary:
      'Metals hold their structure into the close while crude loses its trend support. Levels and invalidation for the week ahead.',
    instruments: [
      {
        symbol: 'XAUUSD',
        name: 'Gold',
        last: '2,341.60',
        change: '-0.61%',
        bias: 'down',
        rows: [
          { label: 'Weekly bias', value: 'Corrective', bias: 'down' },
          { label: 'Primary resistance', value: '2,372 / 2,401' },
          { label: 'Primary support', value: '2,318 / 2,286' },
          { label: 'Invalidation', value: 'Reclaim of 2,401 on volume', bias: 'up' },
        ],
        commentary:
          'Profit-taking into event risk rather than a change of trend. The weekly pivot at 2,318 is the line that matters.',
      },
      {
        symbol: 'WTI',
        name: 'Crude Oil',
        last: '78.20',
        change: '-1.84%',
        bias: 'down',
        rows: [
          { label: 'Weekly bias', value: 'Bearish', bias: 'down' },
          { label: 'Primary resistance', value: '81.40 / 83.10' },
          { label: 'Primary support', value: '76.50 / 74.20' },
          { label: 'Invalidation', value: 'Daily close above 83.10', bias: 'up' },
        ],
      },
    ],
  },
  {
    type: 'international_markets',
    title: 'Dollar strength caps the European indices',
    summary:
      'DXY presses higher and the export-heavy indices stall. Where the rotation is running and what breaks it.',
    instruments: [
      {
        symbol: 'DXY',
        name: 'US Dollar Index',
        last: '104.28',
        change: '+0.34%',
        bias: 'up',
        rows: [
          { label: 'Weekly bias', value: 'Constructive', bias: 'up' },
          { label: 'Primary resistance', value: '105.10 / 105.86' },
          { label: 'Primary support', value: '103.40 / 102.75' },
          { label: 'Invalidation', value: 'Weekly close below 102.75', bias: 'down' },
        ],
      },
      {
        symbol: 'DAX',
        name: 'German DAX 40',
        last: '18,214',
        change: '-0.42%',
        bias: 'down',
        rows: [
          { label: 'Weekly bias', value: 'Neutral' },
          { label: 'Primary resistance', value: '18,510 / 18,890' },
          { label: 'Primary support', value: '17,960 / 17,610' },
          { label: 'Invalidation', value: 'Loss of 17,610', bias: 'down' },
        ],
      },
    ],
  },
  {
    type: 'options_crypto_spread',
    title: 'Bitcoin reclaims its range high as volatility compresses',
    summary:
      'Defined-risk structures into a quiet vol regime, plus the spread that has run three weeks straight.',
    instruments: [
      {
        symbol: 'BTCUSD',
        name: 'Bitcoin',
        last: '61,480',
        change: '+2.44%',
        bias: 'up',
        rows: [
          { label: 'Weekly bias', value: 'Constructive', bias: 'up' },
          { label: 'Primary resistance', value: '64,200 / 67,900' },
          { label: 'Primary support', value: '58,600 / 55,200' },
          { label: 'Invalidation', value: 'Weekly close below 55,200', bias: 'down' },
        ],
      },
      {
        symbol: 'VIX',
        name: 'Volatility Index',
        last: '12.86',
        change: '-3.10%',
        bias: 'down',
        rows: [
          { label: 'Weekly bias', value: 'Suppressed', bias: 'down' },
          { label: 'Structure', value: 'Long-dated premium remains cheap' },
          { label: 'Invalidation', value: 'Sustained move above 16', bias: 'up' },
        ],
      },
    ],
  },
]

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)

  const member = await db.member.upsert({
    where: { email: 'demo@northstarresearch.com' },
    create: {
      email: 'demo@northstarresearch.com',
      passwordHash,
      firstName: 'Demo',
      lastName: 'Member',
      role: 'member',
      subscriptionStatus: 'active',
      subscriptionStartedAt: new Date(),
      // Demo member sits mid-period so the account page shows a real renewal date.
      subscriptionRenewsAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
      billingProvider: 'stripe',
      source: 'admin_manual',
      tags: ['demo'],
    },
    update: {
      passwordHash,
      subscriptionStatus: 'active',
      subscriptionRenewsAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
    },
  })

  await db.redemptionCode.upsert({
    where: { code: 'NSR-DEMO-CODE' },
    create: { code: 'NSR-DEMO-CODE', email: 'newmember@example.com', status: 'unused' },
    update: { status: 'unused', redeemedAt: null, redeemedByMemberId: null },
  })

  for (const [index, entry] of REPORTS.entries()) {
    const publishDate = new Date(Date.now() - index * 24 * 60 * 60 * 1000)

    const existing = await db.report.findFirst({ where: { title: entry.title } })
    const data = {
      type: entry.type,
      title: entry.title,
      summary: entry.summary,
      publishDate,
      instruments: entry.instruments as never,
      htmlContent:
        `<h2>Summary</h2><p>${entry.summary}</p>` +
        '<h2>What changed this week</h2>' +
        '<p>Demo content generated by the seed script. Replace it by uploading a real report ' +
        'through the admin console.</p>' +
        '<ul><li>Levels updated across every instrument in the table above.</li>' +
        '<li>Invalidation is the level that ends the idea, not a stop suggestion.</li></ul>',
      published: true,
      publishedAt: publishDate,
    }

    if (existing) {
      await db.report.update({ where: { id: existing.id }, data })
    } else {
      await db.report.create({ data })
    }
  }

  console.log('')
  console.log('✓ Demo data seeded')
  console.log(`  Member:   ${member.email}`)
  console.log(`  Password: ${DEMO_PASSWORD}`)
  console.log('  Code:     NSR-DEMO-CODE (unused, try it at /redeem)')
  console.log('')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
