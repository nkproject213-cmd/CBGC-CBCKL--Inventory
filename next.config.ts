import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const templates = [
      { org: "CBGC", file: "asset-label-template.png" },
      { org: "CBCKL", file: "cbckl-asset-label-template.png" },
    ];
    return templates.map(({ org, file }) => ({
      source: `/templates/${file}`,
      headers: [{
        key: "Content-Disposition",
        value: `attachment; filename="${file}"; filename*=UTF-8''${encodeURIComponent(`${org}-물품-관리표찰-양식.png`)}`,
      }],
    }));
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
      },
      {
        protocol: "https",
        hostname: "**.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
