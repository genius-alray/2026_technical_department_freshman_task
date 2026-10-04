import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Next 16 默认只信任启动时的 hostname（localhost）。
  // 通过 127.0.0.1 访问时 /_next/hmr 会被判定为跨源并拦截，导致整站不 hydrate。
  allowedDevOrigins: ["127.0.0.1", "localhost"],
}

export default nextConfig
