import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Next 16 默认只信任启动时的 hostname（localhost）。
  // 通过 127.0.0.1 访问时 /_next/hmr 会被判定为跨源并拦截，导致整站不 hydrate。
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // Service Worker 绝不进 HTTP 缓存：否则浏览器会一直用旧版本，
  // 「改了缓存策略但不生效」会变成最难查的一类问题。
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ]
  },
}

export default nextConfig
