/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // pdfjs-dist hanya dipakai di browser; jangan di-bundle di server side
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
