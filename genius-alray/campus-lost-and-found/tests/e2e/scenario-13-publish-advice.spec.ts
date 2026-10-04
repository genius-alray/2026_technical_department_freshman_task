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
 * 第 3 轮新增：拍照建议的两条分支 + 全屏加载期间不渲染输入框。
 * mock 契约：<2 张 → retake；>=2 张 → ok。MOCK_AI_DELAY_MS=800 让加载态可稳定断言。
 */
test.describe("场景 13：拍照建议与全屏加载", () => {
  let ctx: TestContext
  let username = ""

  test.beforeEach(async ({ page }) => {
    test.setTimeout(240_000)
    ctx = newTestContext()
    username = uniqueUsername("advice")
    await signUpViaUi(page, username)
    await page.goto("/publish")
    await expect(page.getByRole("heading", { name: "发布招领" })).toBeVisible({
      timeout: T,
    })
  })

  test.afterEach(async () => {
    await cleanupUserByUsername(ctx, username)
  })

  test("1 张 → 建议补拍且有两个按钮；补到 2 张 → 可以直接用且只剩一个主按钮", async ({
    page,
  }) => {
    await uploadPhoto(page, "photo-1.png")
    await expect(page.getByText("已上传 1/5")).toBeVisible({ timeout: 60_000 })

    await expect(page.getByTestId("photo-advice-retake")).toBeVisible({
      timeout: T,
    })
    await expect(page.getByTestId("photo-advice-ok")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "继续拍照" })).toBeVisible({
      timeout: T,
    })
    await expect(page.getByRole("button", { name: "下一步" })).toHaveCount(1, {
      timeout: T,
    })

    await uploadPhoto(page, "photo-2.png")
    await expect(page.getByText("已上传 2/5")).toBeVisible({ timeout: 60_000 })

    await expect(page.getByTestId("photo-advice-ok")).toBeVisible({
      timeout: T,
    })
    await expect(page.getByTestId("photo-advice-retake")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "继续拍照" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "下一步" })).toHaveCount(1, {
      timeout: T,
    })
  })

  test("全屏加载：识别期间没有任何名称/描述输入框，结束后表单出现且有值", async ({
    page,
  }) => {
    await uploadPhoto(page, "photo-1.png")
    await expect(page.getByText("已上传 1/5")).toBeVisible({ timeout: 60_000 })
    await uploadPhoto(page, "photo-2.png")
    await expect(page.getByTestId("photo-advice-ok")).toBeVisible({
      timeout: T,
    })

    await page.getByRole("button", { name: "下一步" }).click()

    // 加载态必须可见，且此刻屏上没有输入框（第 2 轮的「两套输入框」是真实 bug）
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
    await expect(page.getByTestId("analyze-loading")).toHaveCount(0, {
      timeout: T,
    })
  })
})
