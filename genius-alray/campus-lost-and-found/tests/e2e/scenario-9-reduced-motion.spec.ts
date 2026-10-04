import { expect, test } from "@playwright/test"
import {
  cardByTitle,
  cleanupUserByUsername,
  newTestContext,
  signUpViaUi,
  uniqueUsername,
  uploadPhoto,
} from "./helpers"
import type { TestContext } from "../helpers/supabase"

const T = 30_000

/**
 * 动效无障碍反证：系统开启「减少动态效果」时，MotionProvider(reducedMotion="user")
 * 应让动画退化但不影响可用性 —— 元素依然可见可点，发布主流程依然能走完。
 */
test.use({ reducedMotion: "reduce" })

test.describe("场景 9：reducedMotion=reduce 下的发布主流程", () => {
  let ctx: TestContext
  let username = ""

  test.beforeEach(async ({ page }) => {
    test.setTimeout(240_000)
    ctx = newTestContext()
    username = uniqueUsername("reduce")
    await signUpViaUi(page, username)
  })

  test.afterEach(async () => {
    await cleanupUserByUsername(ctx, username)
  })

  test("减少动态效果时发布流程可完成，元素始终可见可点", async ({ page }) => {
    // 先确认环境真的生效（避免选项没带上导致「假验证」）
    const reduced = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
    expect(reduced).toBe(true)

    const editedTitle = "E2E 降动 " + Math.random().toString(36).slice(2, 6)
    await page.goto("/publish")

    await expect(page.getByRole("button", { name: /选择照片/ })).toBeVisible({
      timeout: T,
    })
    await uploadPhoto(page, "photo-1.png")
    await expect(page.getByText("已上传 1/5")).toBeVisible({ timeout: 60_000 })
    // 第 5 轮：点「下一步」时统一检查一次；1 张 → 弹补拍对话框（减少动态效果下也必须正常出现）
    await page.getByRole("button", { name: "下一步" }).click()
    await expect(page.getByTestId("photo-advice-dialog")).toBeVisible({
      timeout: T,
    })
    await page.getByTestId("photo-advice-skip").click()

    await expect(page.locator("#title")).toBeVisible({ timeout: T })
    await expect(page.locator("#title")).not.toHaveValue("", {
      timeout: 60_000,
    })
    await page.locator("#title").fill(editedTitle)
    await page.getByRole("button", { name: "下一步" }).click()

    await expect(page.getByRole("button", { name: "代为保管" })).toBeVisible({
      timeout: T,
    })
    await page.getByRole("button", { name: "代为保管" }).click()
    await expect(page.locator("#contact")).toBeVisible({ timeout: T })
    await page.locator("#contact").fill("13500135000")
    await page.getByRole("button", { name: "发布", exact: true }).click()

    await expect(page.getByTestId("publish-success")).toBeVisible({
      timeout: T,
    })
    await page.waitForURL(/\/$/, { timeout: T })
    await expect(cardByTitle(page, editedTitle)).toBeVisible({ timeout: T })
  })
})
