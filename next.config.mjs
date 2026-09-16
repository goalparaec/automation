/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['exceljs', 'yauzl', 'sax'],
  },
};

export default nextConfig;
