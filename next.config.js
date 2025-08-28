/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@gin-rummy/common'],
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
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
  webpack: (config) => {
    // Exclude test files and directories from build
    config.module.rules.push({
      test: /\/tests\/|\/tests$/,
      use: 'ignore-loader'
    });
    
    config.module.rules.push({
      test: /\.(test|spec)\.(js|jsx|ts|tsx)$/,
      use: 'ignore-loader'
    });
    
    // Use raw-loader as ignore-loader since ignore-loader may not be available
    config.resolveLoader = config.resolveLoader || {};
    config.resolveLoader.alias = config.resolveLoader.alias || {};
    config.resolveLoader.alias['ignore-loader'] = 'raw-loader';

    return config;
  },
};

export default nextConfig;