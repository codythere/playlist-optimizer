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
  eslint: {
    // ❗ 在 build 時不要把 ESLint 當成 blocking error
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
