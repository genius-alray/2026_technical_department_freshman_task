import { defineConfig, devices } from "@playwright/test"
import { config as loadEnv } from "dotenv"

// verifier 本地运行用配置：
// - 复用已在运行的 dev server（不自动起服务，避免与队友的 dev server 争锁）
// - 必须用 localhost：Next 16 dev 会把 127.0.0.1 视为跨源并阻断 /_next/* 资源，导致不 hydration
loadEnv({ path: ".env.local", quiet: true })
loadEnv({ path: ".env", quiet: true })

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3001"

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
})
