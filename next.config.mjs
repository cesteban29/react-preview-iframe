/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable iframe embedding
  async headers() {
    return [
      {
        source: '/',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'ALLOWALL',
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors *",
          },
        ],
      },
    ]
  },
  
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Enable compression
  compress: true,
  
  // Optimize images
  images: {
    unoptimized: true,
  },
}

export default nextConfig
