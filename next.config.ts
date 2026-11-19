import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  // Isolated build dir for the Playwright e2e dev server so it never
  // collides with the user's running `next dev` on the default .next cache.
  distDir: process.env.NEXT_E2E_DIST_DIR || '.next',
  typescript: {
    ignoreBuildErrors: false,
  },
  // Do not advertise the framework in response headers
  poweredByHeader: false,
  // Keep the local preview focused on the product canvas.
  devIndicators: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
