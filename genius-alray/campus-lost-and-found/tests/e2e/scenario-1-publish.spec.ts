import { expect, test } from "@playwright/test"
import {
  cardByTitle,
  cleanupUserByUsername,
  newTestContext,
  signUpViaUi,
  uniqueUsername,
  uploadPhoto,
} from "./helpers"
import { type TestContext } from "../helpers/supabase"

/** 等服务器渲染/切屏的断言统一显式 30s：断言默认 5s，dev 下不够。 */
const T = 30_000

/**
 * 场景 1（第 3 轮 UI：拍照建议 + 全屏加载）
 * 1 张 → 建议补拍（底部并排「继续拍照」+「下一步」）→ 补拍第 2 张 → 可以直接用（只剩「下一步」）
 * → 第 2 屏全屏加载期间没有输入框 → 表单出现 → 编辑名称 → 第 3 屏 → 发布 → 回失物墙。
 */
test.describe("场景 1：发布三步向导（含拍照建议与全屏加载）", () => {
  let ctx: TestContext
  let username = ""

  test.beforeEach(async ({ page }) => {
    test.setTimeout(240_000)
    ctx = newTestContext()
    username = uniqueUsername("pub")
    await signUpViaUi(page, username)
  })

  test.afterEach(async () => {
    await cleanupUserByUsername(ctx, username)
  })

  test("拍照 → 建议补拍 → 补拍 → 自动识别 → 编辑名称 → 代为保管 → 发布成功", async ({
    page,
  }) => {
    const contact = "13500135000"
    const editedTitle = "E2E 发布 " + Math.random().toString(36).slice(2, 6)

    await page.goto("/publish")
    await expect(page.getByRole("heading", { name: "发布招领" })).toBeVisible({
      timeout: T,
    })
    await expect(page.getByRole("button", { name: /选择照片/ })).toBeVisible({
      timeout: T,
    })

    // 第 1 张（第 5 轮：上传时不再内联给建议，点「下一步」才统一检查一次）
    await uploadPhoto(page, "photo-1.png")
    await expect(page.getByText("已上传 1/5")).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId("photo-advice-dialog")).toHaveCount(0)

    // 第 2 张 → 点「下一步」：先全屏检查，再进第 2 屏（2 张 → mock 通过）
    await uploadPhoto(page, "photo-2.png")
    await expect(page.getByText("已上传 2/5")).toBeVisible({ timeout: 60_000 })
    await page.getByRole("button", { name: "下一步" }).click()
    await expect(page.getByTestId("photo-check-loading")).toBeVisible({
      timeout: T,
    })
    await expect(page.getByTestId("photo-advice-dialog")).toHaveCount(0)

    // 第 2 屏：AI 写描述时同样是全屏加载，期间不许有输入框
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
    await expect(page.locator("#description")).not.toHaveValue("", {
      timeout: 60_000,
    })
    await page.locator("#title").fill(editedTitle)
    await page.getByRole("button", { name: "下一步" }).click()

    await expect(page.getByRole("button", { name: "代为保管" })).toBeVisible({
      timeout: T,
    })
    await page.getByRole("button", { name: "代为保管" }).click()
    await expect(page.locator("#contact")).toBeVisible({ timeout: T })
    await page.locator("#contact").fill(contact)
    await page.getByRole("button", { name: "发布", exact: true }).click()

    await expect(page.getByTestId("publish-success")).toBeVisible({
      timeout: T,
    })
    await page.waitForURL(/\/$/, { timeout: T })

    const card = cardByTitle(page, editedTitle)
    await expect(card).toBeVisible({ timeout: T })
    await expect(page.getByTestId("item-wall")).toBeVisible({ timeout: T })

    const item = await ctx.admin
      .from("found_items")
      .select("id, title, description, custody, contact, status")
      .eq("title", editedTitle)
      .single()
    expect(item.error).toBeNull()
    expect(item.data?.status).toBe("published")
    expect(item.data?.custody).toBe("kept")
    expect(item.data?.contact).toBe(contact)
    expect((item.data?.description ?? "").length).toBeGreaterThan(0)

    const images = await ctx.admin
      .from("found_item_images")
      .select("storage_path", { count: "exact" })
      .eq("found_item_id", item.data!.id)
    expect(images.count).toBe(2)

    await card.click()
    await page.waitForURL(new RegExp("/items/" + item.data!.id), { timeout: T })
    await expect(page.getByTestId("item-owner-notice")).toBeVisible({
      timeout: T,
    })
    await expect(page.getByTestId("pickup-open")).toHaveCount(0, {
      timeout: T,
    })
  })
})
