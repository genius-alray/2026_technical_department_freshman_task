import { expect, test } from "@playwright/test"
import type { TestContext } from "../helpers/supabase"
import {
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
 * 场景 14（第 5 轮）：个人信息闭环
 * - /me 入口 → /me/profile 填写 → 回 /me 显示「姓名 · 手机号」→ DB 落库
 * - 认领屏预填 profile；提交后 profiles 与 pickups 一致（服务端写回）
 */
test.describe("场景 14：个人信息闭环", () => {
  let ctx: TestContext
  let item: E2EItem

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    ctx = newTestContext()
    const owner = await createE2EUser(ctx, "owner")
    item = await createPublishedItem(ctx, owner, {
      title: "E2E 个人信息 " + Math.random().toString(36).slice(2, 6),
      contact: "13900139000",
    })
  })

  test.afterAll(async () => {
    await ctx.cleanup()
  })

  test("空态 → 进 /me/profile 保存 → 回 /me 显示姓名与手机号，DB 落库", async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const context = await browser.newContext()
    const page = await context.newPage()
    const username = uniqueUsername("prof")
    try {
      await signUpViaUi(page, username)
      await page.goto("/me")

      const entry = page.getByTestId("profile-entry")
      await expect(entry).toBeVisible({ timeout: T })
      await expect(entry).toContainText("填写个人信息")

      await entry.click()
      await page.waitForURL(/\/me\/profile$/, { timeout: T })
      await expect(page.getByRole("heading", { name: "我的信息" })).toBeVisible(
        { timeout: T }
      )

      await page.locator("#profile-name").fill("张三")
      await page.locator("#profile-phone").fill("13800138000")
      await page.getByTestId("profile-submit").click()

      await page.waitForURL(/\/me$/, { timeout: T })
      await expect(page.getByTestId("profile-entry")).toContainText(
        "张三 · 13800138000",
        { timeout: T }
      )

      const profile = await ctx.admin
        .from("profiles")
        .select("real_name, phone")
        .eq("username", username)
        .single()
      expect(profile.data?.real_name).toBe("张三")
      expect(profile.data?.phone).toBe("13800138000")
    } finally {
      await context.close()
      await cleanupUserByUsername(ctx, username)
    }
  })

  test("已填信息的人认领：表单预填且提示「已保存」；未填的人为空并提示「填一次」", async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    const filledCtx = await browser.newContext()
    const filled = await filledCtx.newPage()
    const filledName = uniqueUsername("filled")
    const freshCtx = await browser.newContext()
    const fresh = await freshCtx.newPage()
    const freshName = uniqueUsername("fresh")
    try {
      // A：先填好个人信息
      await signUpViaUi(filled, filledName)
      await filled.goto("/me/profile")
      await filled.locator("#profile-name").fill("李四")
      await filled.locator("#profile-phone").fill("13700137000")
      await filled.getByTestId("profile-submit").click()
      await filled.waitForURL(/\/me$/, { timeout: T })

      await filled.goto("/items/" + item.id + "/claim")
      await expect(filled.getByTestId("pickup-name")).toHaveValue("李四", {
        timeout: T,
      })
      await expect(filled.getByTestId("pickup-phone")).toHaveValue(
        "13700137000"
      )
      await expect(filled.getByText("已保存，可直接认领")).toBeVisible({
        timeout: T,
      })

      // B：没填过的人 → 空表单 + 提示
      await signUpViaUi(fresh, freshName)
      await fresh.goto("/items/" + item.id + "/claim")
      await expect(fresh.getByTestId("pickup-name")).toHaveValue("", {
        timeout: T,
      })
      await expect(fresh.getByTestId("pickup-phone")).toHaveValue("")
      await expect(fresh.getByText("填一次，以后认领直接用")).toBeVisible({
        timeout: T,
      })

      // A 完成认领（二次确认）→ profiles 与 pickups 一致
      await submitClaimWithConfirm(filled)
      await expect(filled.getByTestId("claim-success")).toBeVisible({
        timeout: T,
      })
      await filled.waitForURL(new RegExp("/items/" + item.id + "$"), {
        timeout: T,
      })
      await expect(filled.getByTestId("reveal-contact")).toBeVisible({
        timeout: T,
      })

      const profile = await ctx.admin
        .from("profiles")
        .select("real_name, phone")
        .eq("username", filledName)
        .single()
      const pickup = await ctx.admin
        .from("pickups")
        .select("picker_name, picker_phone")
        .eq("found_item_id", item.id)
        .single()
      expect(pickup.data?.picker_name).toBe(profile.data?.real_name)
      expect(pickup.data?.picker_phone).toBe(profile.data?.phone)
      expect(pickup.data?.picker_name).toBe("李四")
    } finally {
      await filledCtx.close()
      await freshCtx.close()
      await cleanupUserByUsername(ctx, filledName)
      await cleanupUserByUsername(ctx, freshName)
    }
  })
})
