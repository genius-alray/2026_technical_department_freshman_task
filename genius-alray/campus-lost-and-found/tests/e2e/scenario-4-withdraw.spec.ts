import { expect, test } from "@playwright/test"
import { withdrawItemRaw } from "../helpers/fixtures"
import type { TestContext } from "../helpers/supabase"
import {
  cardByTitle,
  createE2EUser,
  createPublishedItem,
  newTestContext,
  signInViaUi,
  signUpViaUi,
  uniqueUsername,
  type E2EItem,
  type E2EUser,
} from "./helpers"
import { createPickup } from "../helpers/fixtures"

const T = 30_000

/**
 * 场景 4（第 4 轮）：撤单
 * - 未认领时：/me 撤单 → DB withdrawn → 墙上看不到、他人 404、owner 详情页显示已撤单
 * - 已被认领后：/me 不再显示撤单按钮；直接调 RPC 也被 P0001 拒绝
 */
test.describe("场景 4：拾主撤单", () => {
  let ctx: TestContext
  let owner: E2EUser
  let target: E2EItem
  let control: E2EItem

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    ctx = newTestContext()
    owner = await createE2EUser(ctx, "owner")
    const controlOwner = await createE2EUser(ctx, "ctrl")
    const rand = Math.random().toString(36).slice(2, 6)
    target = await createPublishedItem(ctx, owner, {
      title: "E2E 待撤单 " + rand,
    })
    control = await createPublishedItem(ctx, controlOwner, {
      title: "E2E 对照 " + rand,
    })
  })

  test.afterAll(async () => {
    await ctx.cleanup()
  })

  test("未认领时撤单：墙上消失、owner 见已撤单、他人 404", async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const ownerCtx = await browser.newContext()
    const ownerPage = await ownerCtx.newPage()
    try {
      await signInViaUi(ownerPage, owner.username)
      await ownerPage.goto("/")
      await expect(cardByTitle(ownerPage, control.title)).toBeVisible({
        timeout: T,
      })
      await expect(cardByTitle(ownerPage, target.title)).toBeVisible({
        timeout: T,
      })

      await ownerPage.goto("/me")
      const withdraw = ownerPage.getByRole("button", { name: "撤单" }).first()
      await expect(withdraw).toBeVisible({ timeout: T })
      await withdraw.click()

      // 先用 service_role 证明产品侧真的撤了（与 UI 渲染解耦）
      await expect
        .poll(
          async () => {
            const row = await ctx.admin
              .from("found_items")
              .select("status")
              .eq("id", target.id)
              .single()
            return row.data?.status ?? null
          },
          { timeout: T, message: "撤单没有把物品置为 withdrawn（产品侧问题）" }
        )
        .toBe("withdrawn")

      await ownerPage.goto("/")
      await expect(cardByTitle(ownerPage, control.title)).toBeVisible({
        timeout: T,
      })
      await expect(cardByTitle(ownerPage, target.title)).toHaveCount(0, {
        timeout: T,
      })

      await ownerPage.goto("/items/" + target.id)
      await expect(ownerPage.getByTestId("pickup-withdrawn")).toBeVisible({
        timeout: T,
      })
    } finally {
      await ownerCtx.close()
    }

    // 他人访问已撤单物品 → RLS 隐藏 → 404
    const strangerCtx = await browser.newContext()
    const stranger = await strangerCtx.newPage()
    const strangerName = uniqueUsername("stranger")
    try {
      await signUpViaUi(stranger, strangerName)
      const response = await stranger.goto("/items/" + target.id)
      expect(response?.status()).toBe(404)
    } finally {
      await strangerCtx.close()
      const profile = await ctx.admin
        .from("profiles")
        .select("id")
        .eq("username", strangerName)
        .maybeSingle()
      if (profile.data?.id) {
        await ctx.admin.auth.admin.deleteUser(profile.data.id)
      }
    }
  })

  test("已被认领后：/me 没有撤单按钮，直接调 RPC 也被拒", async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const picker = await createE2EUser(ctx, "picker")
    const claimed = await createPublishedItem(ctx, owner, {
      title: "E2E 已认领 " + Math.random().toString(36).slice(2, 6),
    })
    await createPickup(picker.user, claimed.id, "李四", "13900139000")

    const ownerCtx = await browser.newContext()
    const ownerPage = await ownerCtx.newPage()
    try {
      await signInViaUi(ownerPage, owner.username)
      await ownerPage.goto("/me")
      // 已认领的物品仍在「我的发布」，但不给撤单按钮
      await expect(ownerPage.getByText(claimed.title).first()).toBeVisible({
        timeout: T,
      })
      await expect(ownerPage.getByRole("button", { name: "撤单" })).toHaveCount(
        0,
        { timeout: T }
      )
    } finally {
      await ownerCtx.close()
    }

    // 绕过 UI 直接调 RPC：必须被 P0001 拒绝，且物品仍是 claimed
    const result = await withdrawItemRaw(owner.user, claimed.id)
    expect(result.error?.code).toBe("P0001")
    expect(result.error?.message).toContain("该物品已被认领，无法撤单")

    const row = await ctx.admin
      .from("found_items")
      .select("status")
      .eq("id", claimed.id)
      .single()
    expect(row.data?.status).toBe("claimed")
  })
})
