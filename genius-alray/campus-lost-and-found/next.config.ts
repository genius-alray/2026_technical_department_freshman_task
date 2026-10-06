import type { NextConfig } from "next"

const isDev = process.env.NODE_ENV === "development"

/** 浏览器端 supabase-js 要直连 Supabase（登录、直读公开列），必须进 connect-src / img-src */
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin
  } catch {
    return ""
  }
})()

/**
 * 站点存着姓名与手机号，CSP 是 XSS 之外唯一还能兜住的一层。
 *
 * 【为什么 script-src 里有 'unsafe-inline'】Next 的水合引导脚本是内联的，
 * 不用 nonce 就只能放行内联。这确实削弱了 CSP 对 XSS 的防护，但 object-src /
 * base-uri / form-action / frame-ancestors 仍然把注入面收窄了；要彻底去掉它
 * 得给每个请求发 nonce（改 proxy.ts），留待后续。
 * dev 下额外需要 'unsafe-eval'（HMR / source map），并放行 HMR 的 websocket。
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Tailwind 与 motion 都会写内联 style
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${supabaseOrigin ? " " + supabaseOrigin : ""}`,
  "font-src 'self' data:",
  `connect-src 'self'${supabaseOrigin ? " " + supabaseOrigin : ""}${
    isDev ? " ws: wss:" : ""
  }`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // 声明过的类型就是真实类型：上传接口已按魔数校验，这里再断掉浏览器的嗅探
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()",
  },
  // 本机是 http，发 HSTS 没有意义，只在非 dev 下发
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]),
]

const nextConfig: NextConfig = {
  poweredByHeader: false,

  // Next 16 默认只信任启动时的 hostname（localhost）。
  // 通过 127.0.0.1 访问时 /_next/hmr 会被判定为跨源并拦截，导致整站不 hydrate。
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // Service Worker 绝不进 HTTP 缓存：否则浏览器会一直用旧版本，
  // 「改了缓存策略但不生效」会变成最难查的一类问题。
  async headers() {
    return [
      {
        // 全站安全响应头
        source: "/:path*",
        headers: securityHeaders,
      },
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
