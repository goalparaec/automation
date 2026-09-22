/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['exceljs', 'yauzl', 'sax', 'xlsx'],
  },
};

export default nextConfig;
