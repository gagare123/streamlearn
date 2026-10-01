import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,


  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.r2.dev' },
      { protocol: 'https', hostname: 'image.mux.com' },
      { protocol: 'https', hostname: 'stream.mux.com' },
    ],
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    deviceSizes: [375, 640, 750, 1080, 1920],
    imageSizes: [32, 48, 64, 96, 128, 256],
  },

  compress: true,

  serverExternalPackages: [
    'nodemailer',
    'pdf-lib',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
  ],

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        source: '/_next/static/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/api/(.*)',
        headers: [{ key: 'Cache-Control', value: 'no-store, no-cache' }],
      },
      {
        source: '/api/sse/(.*)',
        headers: [
          { key: 'X-Accel-Buffering', value: 'no' },
          { key: 'Cache-Control', value: 'no-cache, no-transform' },
        ],
      },
    ]
  },

  async redirects() {
    return [
      { source: '/dashboard', destination: '/dashboard/student', permanent: false },
    ]
  },

  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve = config.resolve ?? {}
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
      }
    }
    return config
  },
}

export default nextConfig