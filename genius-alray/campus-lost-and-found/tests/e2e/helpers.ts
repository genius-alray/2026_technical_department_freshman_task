import { expect, type Page } from "@playwright/test"
import { publishItem } from "../helpers/fixtures"
import {
  IMAGE_BUCKET,
  PNG_BYTES,
  TEST_PASSWORD,
  createTestContext,
  type TestContext,
  type TestUser,
} from "../helpers/supabase"

/**
 * E2E 共享工具。
 * 约定：
 * - 「注册/登录/发布/领取」等用户可见行为走真实 UI；
 * - 造数据（用户、已发布物品、私有桶对象）走 service_role + lib/db 的真实 RPC 路径，
 *   这样用例只验证被测行为，不被无关步骤拖慢。
 * - 所有账号带随机后缀，结束后删除用户（级联物品/图片/领取）并清理对象。
 */

export const E2E_PASSWORD = TEST_PASSWORD

export function uniqueUsername(prefix: string): string {
  const safe = prefix
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 5)
  return ("e2e_" + safe + "_" + Math.random().toString(36).slice(2, 8)).slice(
    0,
    20
  )
}

export async function signUpViaUi(
  page: Page,
  username: string,
  password = E2E_PASSWORD
): Promise<void> {
  await page.goto("/signup")
  await page.fill("#username", username)
  await page.fill("#password", password)
  await page.fill("#confirmPassword", password)
  await page.getByRole("button", { name: "注册并登录" }).click()
  await expect(page).not.toHaveURL(/\/signup/, { timeout: 30_000 })
}

export async function signInViaUi(
  page: Page,
  username: string,
  password = E2E_PASSWORD
): Promise<void> {
  await page.goto("/login")
  await page.fill("#username", username)
  await page.fill("#password", password)
  await page.getByRole("button", { name: "登录", exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 })
}

/** 通过可见按钮唤起文件选择器（贴近真实交互；隐藏 input 也能被 Playwright 捕获） */
export async function uploadPhoto(
  page: Page,
  name = "photo.png"
): Promise<void> {
  const trigger = page
    .getByRole("button", { name: /选择照片|继续添加|继续拍照|补一张/ })
    .first()
  await expect(trigger).toBeVisible({ timeout: 30_000 })
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 30_000 }),
    trigger.click(),
  ])
  await chooser.setFiles({ name, mimeType: "image/png", buffer: PNG_BYTES })
}

export type E2EUser = { username: string; user: TestUser }

export type E2EItem = {
  id: string
  title: string
  description: string
  contact: string
  locationLabel: string
}

/** 建一个测试账号（API 侧），返回可在 UI 里登录的用户名 */
export async function createE2EUser(
  ctx: TestContext,
  prefix: string
): Promise<E2EUser> {
  const user = await ctx.user(prefix)
  return { username: user.username, user }
}

/** 用真实 RPC 路径发布一条物品，并上传真实图片对象（保证卡片/详情页有图可看） */
export async function createPublishedItem(
  ctx: TestContext,
  owner: E2EUser,
  options: {
    title?: string
    description?: string
    custody?: "kept" | "in_place"
    contact?: string
    locationLabel?: string
    lat?: number | null
    lng?: number | null
    photos?: number
  } = {}
): Promise<E2EItem> {
  const photos = options.photos ?? 1
  const paths: string[] = []
  for (let index = 0; index < photos; index += 1) {
    const path = owner.user.id + "/" + crypto.randomUUID() + ".png"
    const upload = await ctx.admin.storage
      .from(IMAGE_BUCKET)
      .upload(path, PNG_BYTES, { contentType: "image/png", upsert: true })
    if (upload.error) {
      throw new Error("上传测试图片失败：" + upload.error.message)
    }
    ctx.trackStoragePath(path)
    paths.push(path)
  }

  const title =
    options.title ?? "E2E 物品 " + Math.random().toString(36).slice(2, 6)
  const description = options.description ?? "端到端验证用的物品描述。"
  const custody = options.custody ?? "kept"
  const contact = options.contact ?? "13800138000"
  const locationLabel = options.locationLabel ?? ""

  const item = await publishItem(owner.user, {
    title,
    description,
    custody,
    contact,
    locationLabel,
    lat: options.lat ?? null,
    lng: options.lng ?? null,
    photoPaths: paths,
  })

  return { id: item.id, title, description, contact, locationLabel }
}

/** 失物墙上的某张卡（按标题定位） */
export function cardByTitle(page: Page, title: string) {
  return page.locator('[data-testid="item-card"]').filter({ hasText: title })
}

export function newTestContext(): TestContext {
  return createTestContext()
}

/**
 * 第 5 轮：认领改为「先弹诚信确认，再写入」。
 * 点「确认认领」→ 等 Dialog → 点「我确认」。
 */
export async function submitClaimWithConfirm(page: Page): Promise<void> {
  await page.getByTestId("pickup-submit").click()
  await expect(page.getByTestId("claim-confirm")).toBeVisible({
    timeout: 30_000,
  })
  await page.getByTestId("claim-confirm-ok").click()
}

/**
 * 清理「通过 UI 注册」的账号：ctx.cleanup() 只知道 API 侧创建的用户，
 * 这里按用户名反查 id，删除其私有桶对象（{uid}/{itemId}/{uuid}.ext 两级目录）
 * 后再删用户（级联物品/图片/领取记录）。
 */
export async function cleanupUserByUsername(
  ctx: TestContext,
  username: string
): Promise<void> {
  const profile = await ctx.admin
    .from("profiles")
    .select("id")
    .eq("id", username)
    .maybeSingle()
  const userId = profile.data?.id
  if (!userId) return

  try {
    const topLevel = await ctx.admin.storage
      .from(IMAGE_BUCKET)
      .list(userId, { limit: 200 })
    for (const entry of topLevel.data ?? []) {
      const asFile = userId + "/" + entry.name
      if (entry.id) {
        await ctx.admin.storage.from(IMAGE_BUCKET).remove([asFile])
        continue
      }
      const files = await ctx.admin.storage
        .from(IMAGE_BUCKET)
        .list(asFile, { limit: 200 })
      const paths = (files.data ?? []).map((file) => asFile + "/" + file.name)
      if (paths.length > 0) {
        await ctx.admin.storage.from(IMAGE_BUCKET).remove(paths)
      }
    }
  } catch {
    // 存储清理失败不阻塞用例结论；用户删除仍会级联清掉数据库行
  }

  await ctx.admin.auth.admin.deleteUser(userId)
}
