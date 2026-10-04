import { expect, test } from "@playwright/test"
import type { TestContext } from "../helpers/supabase"
import {
  createE2EUser,
  createPublishedItem,
  newTestContext,
  signUpViaUi,
  submitClaimWithConfirm,
  uniqueUsername,
  type E2EItem,
} from "./helpers"

const T = 30_000

/**
 * 场景 11（第 4 轮）：认领是独立一屏
 * 详情页只有链接 → /items/[id]/claim → h1「认领物品」→ 表单 → claim-success → 回详情揭晓。
 */
test.describe("场景 11：认领独立一屏", () => {
  let ctx: TestContext
  let item: E2EItem

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    ctx = newTestContext()
    const owner = await createE2EUser(ctx, "owner")
    item = await createPublishedItem(ctx, owner, {
      title: "E2E 认领屏 " + Math.random().toString(36).slice(2, 6),
      contact: "13900139000",
      photos: 2,
    })
  })

  test.afterAll(async () => {
    await ctx.cleanup()
  })

  test("详情页只有链接；URL 变 /claim、h1 正确、提交后整屏对勾再回详情揭晓", async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await signUpViaUi(page, uniqueUsername("claimer"))

    await page.goto("/items/" + item.id)
    const open = page.getByTestId("pickup-open")
    await expect(open).toBeVisible({ timeout: T })
    await expect(open).toHaveAttribute("href", "/items/" + item.id + "/claim")
    // 详情页本身没有内联表单
    await expect(page.getByTestId("pickup-form")).toHaveCount(0)

    await open.click()
    await page.waitForURL(new RegExp("/items/" + item.id + "/claim$"), {
      timeout: T,
    })
    await expect(page.getByRole("heading", { name: "认领物品" })).toBeVisible({
      timeout: T,
    })
    await expect(page.getByTestId("pickup-form")).toBeVisible({ timeout: T })
    await expect(page.getByTestId("pickup-cancel")).toBeVisible({ timeout: T })

    await submitClaimWithConfirm(page)
    // D-2 修复后：整屏对勾必须真的可见（服务端 revalidate 不得抢先重定向）
    await expect(page.getByTestId("claim-success")).toBeVisible({ timeout: T })
    await page.waitForURL(new RegExp("/items/" + item.id + "$"), { timeout: T })
    await expect(page.getByTestId("reveal-contact")).toBeVisible({ timeout: T })
    await expect(page.getByTestId("pickup-success")).toBeVisible({ timeout: T })
  })
})
