/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'twilio'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        // The pdf.js worker is an ES module and is loaded as `new Worker(url, {type:
        // 'module'})`. Browsers refuse a module worker served as anything other than a
        // JavaScript MIME type, and `.mjs` is not universally mapped to one by static
        // hosts — so it is stated explicitly rather than left to chance.
        source: '/pdf.worker.min.mjs',
        headers: [{ key: 'Content-Type', value: 'text/javascript; charset=utf-8' }],
      },
      {
        // Report payloads must never be cached by shared caches — every view is
        // authorised per-request against a live member session.
        source: '/api/reports/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
    ]
  },
}

export default nextConfig
