import { expect, test } from "@playwright/test"
import {
  cleanupUserByUsername,
  newTestContext,
  signUpViaUi,
  uniqueUsername,
  uploadPhoto,
} from "./helpers"
import { type TestContext } from "../helpers/supabase"

const T = 30_000

/**
 * 场景 13（第 5 轮）：拍照判断时机
 * - 上传时不再内联给建议；点「下一步」时才检查一次（全屏 photo-check-loading）
 * - mock：<2 张 → 不通过 → Dialog（继续拍照 / 仍然继续）；>=2 张 → 直接进第 2 屏
 * - 第 2 屏 AI 写描述期间全屏 analyze-loading，且屏上没有输入框
 */
test.describe("场景 13：拍照判断时机与全屏加载", () => {
  let ctx: TestContext
  let username = ""

  test.beforeEach(async ({ page }) => {
    test.setTimeout(240_000)
    ctx = newTestContext()
    username = uniqueUsername("photo")
    await signUpViaUi(page, username)
    await page.goto("/publish")
    await expect(page.getByRole("heading", { name: "发布招领" })).toBeVisible({
      timeout: T,
    })
  })

  test.afterEach(async () => {
    await cleanupUserByUsername(ctx, username)
  })

  test("1 张：点下一步 → 检查 → 补拍对话框；继续拍照留在本屏，仍然继续才进第 2 屏", async ({
    page,
  }) => {
    await uploadPhoto(page, "photo-1.png")
    await expect(page.getByText("已上传 1/5")).toBeVisible({ timeout: 60_000 })
    // 上传时不再内联出建议卡
    await expect(page.getByTestId("photo-advice-dialog")).toHaveCount(0)

    await page.getByRole("button", { name: "下一步" }).click()
    await expect(page.getByTestId("photo-check-loading")).toBeVisible({
      timeout: T,
    })
    await expect(page.getByTestId("photo-advice-dialog")).toBeVisible({
      timeout: T,
    })
    await expect(page.getByTestId("photo-advice-retake")).toBeVisible({
      timeout: T,
    })
    await expect(page.getByTestId("photo-advice-skip")).toBeVisible({
      timeout: T,
    })

    // 「继续拍照」= 留在拍照屏（第 2 屏的输入框不出现）
    await page.getByTestId("photo-advice-retake").click()
    await expect(page.getByTestId("photo-advice-dialog")).toHaveCount(0, {
      timeout: T,
    })
    await expect(page.locator("#title")).toHaveCount(0, { timeout: T })
    await expect(page.getByText("已上传 1/5")).toBeVisible({ timeout: T })

    // 再点一次 → 「仍然继续」→ 进第 2 屏
    await page.getByRole("button", { name: "下一步" }).click()
    await expect(page.getByTestId("photo-advice-dialog")).toBeVisible({
      timeout: T,
    })
    await page.getByTestId("photo-advice-skip").click()
    await expect(page.locator("#title")).toBeVisible({ timeout: 60_000 })
    await expect(page.locator("#title")).not.toHaveValue("", {
      timeout: 60_000,
    })
  })

  test("2 张：点下一步不弹对话框，直接进第 2 屏；写描述期间没有输入框", async ({
    page,
  }) => {
    await uploadPhoto(page, "photo-1.png")
    await expect(page.getByText("已上传 1/5")).toBeVisible({ timeout: 60_000 })
    await uploadPhoto(page, "photo-2.png")
    await expect(page.getByText("已上传 2/5")).toBeVisible({ timeout: 60_000 })

    await page.getByRole("button", { name: "下一步" }).click()
    await expect(page.getByTestId("photo-check-loading")).toBeVisible({
      timeout: T,
    })
    await expect(page.getByTestId("photo-advice-dialog")).toHaveCount(0)

    await expect(page.getByTestId("analyze-loading")).toBeVisible({
      timeout: T,
    })
    await expect(page.locator("#title")).toHaveCount(0, { timeout: 1_000 })
    await expect(page.locator("#description")).toHaveCount(0, {
      timeout: 1_000,
    })

    await expect(page.locator("#title")).toBeVisible({ timeout: 60_000 })
    await expect(page.locator("#title")).not.toHaveValue("", {
      timeout: 60_000,
    })
  })
})
