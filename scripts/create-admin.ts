/**
 * Seed or promote an administrator.
 *
 *   npm run create-admin -- --email=you@example.com
 *   npm run create-admin -- --email=you@example.com --password='a long passphrase'
 *
 * There is deliberately no public signup path for admin accounts (build spec §5.2), so
 * this is the only way the first one comes into existence. Running it against an existing
 * member promotes that account and leaves its password alone unless a new one is given.
 */
import { randomBytes } from 'crypto'

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

function arg(name: string): string | undefined {
  const match = process.argv.find((entry) => entry.startsWith(`--${name}=`))
  return match?.split('=').slice(1).join('=')
}

async function main() {
  const email = arg('email')?.trim().toLowerCase()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: npm run create-admin -- --email=you@example.com [--password=...]')
    process.exit(1)
  }

  // A generated passphrase beats a weak hand-typed one for an account that can see the
  // whole member list and email it.
  const provided = arg('password')
  const password = provided ?? randomBytes(12).toString('base64url')
  const passwordHash = await bcrypt.hash(password, 12)

  const existing = await db.member.findUnique({ where: { email } })

  const member = await db.member.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      role: 'admin',
      subscriptionStatus: 'active',
      subscriptionStartedAt: new Date(),
      source: 'admin_manual',
    },
    update: {
      role: 'admin',
      subscriptionStatus: 'active',
      // Only reset the password when one was explicitly supplied.
      ...(provided ? { passwordHash } : {}),
    },
  })

  console.log('')
  console.log(existing ? '✓ Existing account promoted to admin' : '✓ Admin account created')
  console.log(`  Email:    ${member.email}`)
  if (!existing || provided) {
    console.log(`  Password: ${password}`)
    console.log('')
    console.log('  Store this now — it is not shown again and is not recoverable.')
  } else {
    console.log('  Password: unchanged (pass --password=... to reset it)')
  }
  console.log('')
  console.log('  Sign in at /admin/login')
  console.log('')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
