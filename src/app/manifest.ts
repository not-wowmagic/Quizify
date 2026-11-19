import type { MetadataRoute } from 'next';

/** Single canonical site URL shared by metadata, robots, sitemap and manifest. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://quizify.netlify.app';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Quizify - AI-Powered Quiz Generator',
    short_name: 'Quizify',
    description: 'Turn lecture notes, textbook excerpts, and study documents into interactive quizzes in seconds.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    categories: ['education'],
    background_color: '#0a0a0b',
    theme_color: '#ffffff',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
