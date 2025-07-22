/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@gin-rummy/common'],
  // output: 'standalone', // Temporarily disabled for development
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: '/api/:path*',
      },
    ];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;