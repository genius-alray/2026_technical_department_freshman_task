import { expect, test } from "@playwright/test"
import {
  E2E_PASSWORD,
  cardByTitle,
  cleanupUiUser,
  createE2EUser,
  createPublishedItem,
  newTestContext,
  signUpViaUi,
  uniqueSeed,
  type E2EItem,
  type TestUser,
} from "./helpers"

const T = 30_000

/**
 * 失物墙：
 * - 未登录也能刷信息流，但点卡片会去登录并带上回跳地址；登录后回到那件物品；
 * - 登录/注册页都有「随便看看」回首页；
 * - 超过一页时用「加载更多」翻页。
 */
test.describe("失物墙", () => {
  const ctx = newTestContext()
  let owner: TestUser
  let itemOwner: TestUser
  let item: E2EItem

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    owner = await createE2EUser(ctx, "wall")
    // 墙上那件物品必须是**别人**的：登录后进详情才该看到认领入口
    itemOwner = await createE2EUser(ctx, "owner")
    item = await createPublishedItem(ctx, itemOwner, {
      title: "E2E 信息流 " + Math.random().toString(36).slice(2, 6),
      description: "公开信息流里能看到描述。",
      photos: 1,
    })
  })

  test.afterAll(async () => {
    await ctx.cleanup()
  })

  test("未登录可看信息流；点卡片去登录并回跳详情", async ({ browser }) => {
    test.setTimeout(300_000)
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await page.goto("/")
      await expect(page.getByTestId("item-wall")).toBeVisible({ timeout: T })

      const card = cardByTitle(page, item.title)
      await expect(card).toBeVisible({ timeout: T })
      await expect(card.locator("img").first()).toBeVisible({ timeout: T })
      await expect(card).toContainText(item.description)

      // 未登录不进详情：点卡片去登录，并带回跳地址
      await card.click()
      await page.waitForURL(/\/login\?next=/, { timeout: T })
      await expect(
        page.getByRole("heading", { level: 1, name: "登录" })
      ).toBeVisible({ timeout: T })
      const browse = page.getByTestId("browse-without-login")
      await expect(browse).toBeVisible({ timeout: T })
      await expect(browse).toHaveAttribute("href", "/")

      // 注册页也有「随便看看」（此时还没登录）
      await page.goto("/signup")
      await expect(page.getByTestId("browse-without-login")).toHaveAttribute(
        "href",
        "/"
      )

      // 直接进详情同样会被带去登录并带回跳地址
      await page.goto("/items/" + item.id)
      await page.waitForURL(/\/login\?next=/, { timeout: T })

      // 用测试账号登录：必须回到刚才那件物品
      await page.fill("#phone", owner.phone)
      await page.fill("#password", E2E_PASSWORD)
      await page.getByRole("button", { name: "登录", exact: true }).click()
      await page.waitForURL(new RegExp("/items/" + item.id + "$"), {
        timeout: 60_000,
      })
      await expect(
        page.getByRole("heading", { level: 1, name: item.title })
      ).toBeVisible({ timeout: T })
      await expect(page.getByTestId("pickup-open")).toBeVisible({ timeout: T })

      // 已登录访问登录/注册页会被弹回首页（proxy.ts 的乐观跳转）
      await page.goto("/login")
      await expect(page).toHaveURL(/\/$/, { timeout: T })
    } finally {
      await context.close()
    }
  })

  test("双列瀑布流分页：加载更多后能看到更早发布的物品", async ({ page }) => {
    test.setTimeout(600_000)
    const seed = uniqueSeed("page")
    const runId = Math.random().toString(36).slice(2, 6)
    const titles: string[] = []
    // 顺序创建 22 条（created_at 递增）：第 1 条最旧，应落在第 2 页
    for (let index = 1; index <= 22; index += 1) {
      const title = "E2E 分页 " + String(index).padStart(2, "0") + " " + runId
      titles.push(title)
      await createPublishedItem(ctx, owner, { title, photos: 1 })
    }

    await signUpViaUi(page, seed)
    try {
      await page.goto("/")
      await expect(page.getByTestId("item-wall")).toBeVisible({ timeout: T })

      const newest = titles[titles.length - 1]
      const oldest = titles[0]
      await expect(cardByTitle(page, newest)).toBeVisible({ timeout: T })
      await expect(cardByTitle(page, oldest)).toHaveCount(0, { timeout: T })

      let found = false
      for (let attempt = 0; attempt < 3 && !found; attempt += 1) {
        const loadMore = page.getByTestId("load-more")
        if ((await loadMore.count()) === 0) break
        await expect(loadMore).toBeVisible({ timeout: T })
        await loadMore.click()
        try {
          await expect(cardByTitle(page, oldest)).toBeVisible({
            timeout: 20_000,
          })
          found = true
        } catch {
          found = false
        }
      }
      expect(found).toBe(true)
    } finally {
      await cleanupUiUser(ctx, seed)
    }
  })
})
