import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { AppHeader } from "@/components/nav/app-header"
import { getItem } from "@/lib/db/found-items"
import { listMyPickups } from "@/lib/db/pickups"
import { createClient, getCurrentUser } from "@/lib/supabase/server"

import { ClaimForm } from "./claim-form"

export const metadata: Metadata = {
  title: "认领物品 · 校园失物招领",
}

export const dynamic = "force-dynamic"

/**
 * 认领独立一屏：只有「寻找失主中」且不是自己发布的物品可以认领。
 *
 * 【为什么已认领还要放行一次】认领成功会 revalidate 当前路由，
 * 服务端组件会带着 status=claimed 重新渲染。如果这时直接 redirect，
 * 就会抢在客户端「整屏对勾」的 900ms 定时器之前把用户踢走（对勾一闪而过甚至完全不出现）。
 * 所以：**已经认领过这件物品的本人**允许留在这里，由客户端自己决定什么时候回详情页。
 * 别人（包括拾主）一律退回详情页。
 */
export default async function ClaimItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const { id } = await params
  const supabase = await createClient()

  const item = await getItem(supabase, id)
  if (!item) notFound()

  if (item.owner_id === user.id || item.status === "withdrawn") {
    redirect("/items/" + id)
  }

  const mine =
    item.status === "claimed"
      ? (await listMyPickups(supabase, user.id)).some(
          (pickup) => pickup.found_item_id === item.id
        )
      : false
  if (item.status === "claimed" && !mine) {
    redirect("/items/" + id)
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-5">
      <AppHeader
        title="认领物品"
        backHref={"/items/" + id}
        backLabel="返回物品"
        backTestId="pickup-cancel"
      />

      <ClaimForm itemId={item.id} claimedByMe={mine} />
    </div>
  )
}
