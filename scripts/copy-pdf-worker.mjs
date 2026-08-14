import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Copy the pdf.js worker into /public so the report reader can load it from our own
 * origin.
 *
 * Two things ruled out the alternatives:
 *
 *   - A CDN URL (the pdf.js default) means paid research fails to render whenever a
 *     third-party host is slow, blocked or gone. Not acceptable for the product's
 *     primary reading surface.
 *   - `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` is the
 *     documented bundler approach, but Next 14's SWC loader refuses the prebuilt
 *     `.mjs` worker ("'import', and 'export' cannot be used outside of module code").
 *
 * So the file is copied verbatim at build time. It is a build artifact, not source —
 * hence the .gitignore entry. Copying rather than pinning a checked-in copy keeps it
 * in lockstep with the pdfjs-dist version in package.json; a stale worker and a newer
 * API silently fail to render pages.
 */
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const source = join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs')
const targetDir = join(root, 'public')
const target = join(targetDir, 'pdf.worker.min.mjs')

if (!existsSync(source)) {
  // Not fatal on its own — but the reader will not render, so say why loudly.
  console.error(`[pdf-worker] not found at ${source}. Run npm install before building.`)
  process.exit(1)
}

mkdirSync(targetDir, { recursive: true })
copyFileSync(source, target)
console.log('[pdf-worker] copied to public/pdf.worker.min.mjs')
