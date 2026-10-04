import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // 默认 node 环境；需要 DOM 的用例在文件顶部标注
    // // @vitest-environment jsdom
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    // 直连本地 Supabase 的用例较慢
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
