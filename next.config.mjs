/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // pdfjs-dist hanya dipakai di browser (canvas API); cegah bundling di server
      config.externals = [...(config.externals ?? []), "pdfjs-dist"];
    }
    // Abaikan warning "Critical dependency" dari pdf.js worker
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
