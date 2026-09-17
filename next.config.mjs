/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      'exceljs',
      'yauzl',
      'sax',
      'xlsx',
      'playwright-core',
      '@sparticuz/chromium-min',
    ],
  },
};

export default nextConfig;
