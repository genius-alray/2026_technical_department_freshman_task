import { expect, test } from "@playwright/test"
import type { TestContext } from "../helpers/supabase"
import {
  cleanupUserByUsername,
  createE2EUser,
  createPublishedItem,
  newTestContext,
  signUpViaUi,
  uniqueUsername,
  type E2EItem,
} from "./helpers"

const T = 30_000

/**
 * 场景 16（第 5 轮）：统一标题栏
 * - 每个登录后页面有且只有一个 title-bar，且没有第二个自绘 header
 * - /login、/signup 没有 title-bar（扁平页自己出 h1）
 * - 详情页标题由物品名称覆盖；返回控件 testid 按路由
 */
test.describe("场景 16：统一标题栏", () => {
  let ctx: TestContext
  let item: E2EItem

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    ctx = newTestContext()
    const owner = await createE2EUser(ctx, "owner")
    item = await createPublishedItem(ctx, owner, {
      title: "E2E 标题栏 " + Math.random().toString(36).slice(2, 6),
    })
  })

  test.afterAll(async () => {
    await ctx.cleanup()
  })

  test("登录与注册页没有 title-bar", async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto("/login")
    await expect(page.getByTestId("title-bar")).toHaveCount(0, { timeout: T })
    await expect(page.locator("header")).toHaveCount(0, { timeout: T })

    await page.goto("/signup")
    await expect(page.getByTestId("title-bar")).toHaveCount(0, { timeout: T })
    await expect(page.locator("header")).toHaveCount(0, { timeout: T })
  })

  test("登录后各页面都有且只有一个标题栏（没有第二个自绘 header）", async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const context = await browser.newContext()
    const page = await context.newPage()
    const username = uniqueUsername("bar")
    try {
      await signUpViaUi(page, username)

      const cases: Array<{ path: string; title?: string }> = [
        { path: "/", title: "失物墙" },
        { path: "/publish", title: "发布招领" },
        { path: "/me", title: "我的" },
        { path: "/items/" + item.id },
      ]

      for (const route of cases) {
        await page.goto(route.path)
        await expect(
          page.getByTestId("title-bar"),
          route.path + " 应有唯一标题栏"
        ).toHaveCount(1, { timeout: T })
        // 页面里不能有第二个自绘 header：整页只允许 1 个 header，且它就是标题栏
        // （注意：标题栏在 template 的 motion 包装里，所以不是 main 的直接子元素）
        await expect(page.locator("header")).toHaveCount(1, { timeout: T })
        await expect(
          page.locator('header[data-testid="title-bar"]')
        ).toHaveCount(1, { timeout: T })
        // 标题栏必须在 main 内部（页面区域），而不是游离在其它位置
        await expect(page.locator("main header")).toHaveCount(1, {
          timeout: T,
        })
        if (route.title) {
          await expect(
            page.getByRole("heading", { level: 1, name: route.title })
          ).toBeVisible({ timeout: T })
        }
      }
    } finally {
      await context.close()
      await cleanupUserByUsername(ctx, username)
    }
  })

  test("详情页标题被物品名称覆盖；返回控件按路由", async ({ browser }) => {
    test.setTimeout(240_000)
    const context = await browser.newContext()
    const page = await context.newPage()
    const username = uniqueUsername("bar2")
    try {
      await signUpViaUi(page, username)

      // 首页：右上角「我的」，没有返回控件
      await page.goto("/")
      await expect(page.getByTestId("me-entry")).toBeVisible({ timeout: T })
      await expect(page.getByTestId("item-back")).toHaveCount(0)

      // 详情页：返回 testid = item-back，标题最终是物品名称
      await page.goto("/items/" + item.id)
      await expect(page.getByTestId("item-back")).toBeVisible({ timeout: T })
      await expect(
        page.getByRole("heading", { level: 1, name: item.title })
      ).toBeVisible({ timeout: T })

      // 认领页：返回 testid = pickup-cancel
      await page.goto("/items/" + item.id + "/claim")
      await expect(page.getByTestId("pickup-cancel")).toBeVisible({
        timeout: T,
      })
      await expect(
        page.getByRole("heading", { level: 1, name: "认领物品" })
      ).toBeVisible({ timeout: T })
    } finally {
      await context.close()
      await cleanupUserByUsername(ctx, username)
    }
  })
})
