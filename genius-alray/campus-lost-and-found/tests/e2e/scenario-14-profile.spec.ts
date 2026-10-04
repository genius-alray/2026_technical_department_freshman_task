import { expect, test } from "@playwright/test"
import type { TestContext } from "../helpers/supabase"
import {
  cardByTitle,
  cleanupUserByUsername,
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
 * 场景 14（第 7 轮）：个人信息
 * - 注册即填写真实姓名 + 手机号（不再有「认领时补填」这一步）
 * - 「我的」顶部卡片显示头像/姓名/手机号，点进去可以改
 * - 认领时用账号里的信息：诚信确认框里**只读**展示，认领信息屏显示「我的认领」
 */
test.describe("场景 14：个人信息", () => {
  let ctx: TestContext
  let item: E2EItem

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    ctx = newTestContext()
    const owner = await createE2EUser(ctx, "owner")
    item = await createPublishedItem(ctx, owner, {
      title: "E2E 个人信息 " + Math.random().toString(36).slice(2, 6),
      contact: "13900139000",
      photos: 1,
    })
  })

  test.afterAll(async () => {
    await ctx.cleanup()
  })

  test("注册即带个人信息；可在「我的信息」修改；认领时只读展示", async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const seed = uniqueUsername("me")
    try {
      await signUpViaUi(page, seed)

      // 首页卡片：姓名 + 手机号（来自注册信息）
      await page.goto("/")
      await expect(page.getByTestId("me-entry")).toBeVisible({ timeout: T })
      await page.getByTestId("me-entry").click()
      await page.waitForURL(/\/me$/, { timeout: T })
      await expect(page.getByTestId("profile-entry")).toContainText(
        "测试用户",
        {
          timeout: T,
        }
      )

      // 改成别的姓名 → 读回
      await page.getByTestId("profile-entry").click()
      await page.waitForURL(/\/me\/profile$/, { timeout: T })
      await page.locator("#profile-name").fill("李四")
      await page.getByTestId("profile-submit").click()
      await page.waitForURL(/\/me$/, { timeout: T })
      await expect(page.getByTestId("profile-entry")).toContainText("李四", {
        timeout: T,
      })

      // 认领：确认框里只读展示自己的信息
      await page.goto("/items/" + item.id)
      await page.getByTestId("pickup-open").click()
      await expect(page.getByTestId("claim-confirm-profile")).toContainText(
        "李四",
        { timeout: T }
      )
      // 这里不能拨号：确认框里的号码不是链接
      await expect(
        page.getByTestId("claim-confirm-profile").getByTestId("phone-link")
      ).toHaveCount(0)

      await page.getByTestId("claim-confirm-ok").click()
      await expect(page.getByTestId("claim-guide")).toBeVisible({ timeout: T })
      await expect(page.getByTestId("claim-info-name")).toHaveText("李四", {
        timeout: T,
      })

      // 撤回认领后物品回到待认领
      await page.getByTestId("claim-release-open").click()
      await page.getByTestId("claim-release-ok").click()
      await page.waitForURL(new RegExp(item.id + "$"), { timeout: T })
      await expect(page.getByTestId("pickup-open")).toBeVisible({ timeout: T })
    } finally {
      await cleanupUserByUsername(ctx, seed)
    }
  })

  test("「我的认领」卡片整卡点进详情页", async ({ page }) => {
    test.setTimeout(180_000)
    const seed = uniqueUsername("card")
    try {
      await signUpViaUi(page, seed)
      await page.goto("/items/" + item.id)
      await submitClaimWithConfirm(page)

      await page.goto("/me")
      const card = page.getByTestId("me-pickup-card").first()
      await expect(card).toBeVisible({ timeout: T })
      // 列表里不再内联手机号
      await expect(card).not.toContainText("13900139000")
      await card.click()
      await page.waitForURL(new RegExp("/items/" + item.id + "$"), {
        timeout: T,
      })
      await expect(cardByTitle(page, item.title)).toHaveCount(0)
    } finally {
      await cleanupUserByUsername(ctx, seed)
    }
  })
})
