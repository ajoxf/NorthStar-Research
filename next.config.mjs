/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'twilio'],
  },
  /*
   * Resizing for uploaded artwork.
   *
   * Every picture on this site was a plain <img> pointed at the full-size upload, so a
   * 1390px photograph was downloaded whole and squeezed into a 330px card by the browser
   * in a single pass. A one-shot downscale of that ratio aliases badly — high-contrast
   * type on an image is where it shows first, which is why title cards with words on them
   * looked pixelated while the photographs beside them looked fine. Nothing was wrong with
   * the uploads.
   *
   * Only our own Blob store is allowed through. The uploader also accepts a pasted URL on
   * any host, and an open optimiser is an open proxy — anyone could feed arbitrary images
   * through this deployment's CPU and bandwidth. Those keep the plain <img> path; see
   * components/uploaded-image.tsx.
   */
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**.public.blob.vercel-storage.com' }],
    // Every card width this site actually renders, so a request is served a variant near
    // the size it will be drawn at rather than the nearest of Next's defaults.
    imageSizes: [96, 160, 260, 320, 384, 448, 512],
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
