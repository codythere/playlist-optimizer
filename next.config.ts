import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com", // ✅ YouTube 縮圖來源
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com", // ✅ Google 登入頭像來源
      },
    ],
  },
};

export default nextConfig;
