import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: "/templates/asset-label-template.png",
      headers: [{
        key: "Content-Disposition",
        value: `attachment; filename="asset-label-template.png"; filename*=UTF-8''${encodeURIComponent("물품-관리표찰-양식.png")}`,
      }],
    }];
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
