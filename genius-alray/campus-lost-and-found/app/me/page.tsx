import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ImageIcon, InboxIcon, UsersIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  listImagesForItems,
  listMyItems,
  mergeImages,
} from "@/lib/db/found-items"
import { listMyPickups } from "@/lib/db/pickups"
import { unwrap } from "@/lib/db/types"
import { createSignedUrlMap } from "@/lib/storage/signed"
import { createClient, getCurrentUser } from "@/lib/supabase/server"
import {
  ITEM_STATUS_LABEL,
  type DbClient,
  type ItemStatus,
  type ListedItem,
  type Pickup,
} from "@/lib/types"

import { MeItemActions } from "./me-item-actions"
import { STATUS_BADGE_VARIANT } from "./status-variant"
import { MeItemShell } from "./me-item-shell"
import { MeTabs } from "./me-tabs"
import { RevealContact } from "./reveal-contact"

export const metadata: Metadata = {
  title: "我的 · 校园失物招领",
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function formatDate(value: string | null | undefined): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return dateFormatter.format(date)
}

type PickupItemMeta = { title: string; status: ItemStatus }

type MeData = {
  items: ListedItem[]
  pickups: Pickup[]
  pickupItems: Record<string, PickupItemMeta>
}

async function loadMeData(supabase: DbClient, userId: string): Promise<MeData> {
  // listMyItems 已在 lib/db 内部按 owner_id 显式过滤（RLS 会放行全部 published 行）
  const items = await listMyItems(supabase, userId)
  const images = await listImagesForItems(
    supabase,
    items.map((item) => item.id)
  )
  const urlByPath = await createSignedUrlMap(
    images.map((image) => image.storage_path)
  )

  // 同理：pickups 的 RLS 允许拾主看到自己物品上的全部认领记录，必须显式按 picker_id 过滤
  const pickups = await listMyPickups(supabase, userId)
  const pickupItemIds = Array.from(
    new Set(pickups.map((pickup) => pickup.found_item_id))
  )

  // 认领记录对应的物品：已撤单且非本人发布的物品受 RLS 限制读不到，这里只取显式列
  const pickupItems: Record<string, PickupItemMeta> = {}
  if (pickupItemIds.length > 0) {
    const rows = unwrap(
      await supabase
        .from("found_items")
        .select("id, title, status")
        .in("id", pickupItemIds)
    )
    for (const row of rows) {
      pickupItems[row.id] = { title: row.title, status: row.status }
    }
  }

  return {
    items: mergeImages(items, images, urlByPath),
    pickups,
    pickupItems,
  }
}

function MyItemCard({ item }: { item: ListedItem }) {
  const cover = item.images.find((image) => image.url)?.url ?? ""
  const published = item.status === "published"

  return (
    <MeItemShell itemId={item.id}>
      <Card size="sm">
        <CardContent className="flex gap-3">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt={item.title}
                className="size-full object-cover"
              />
            ) : (
              <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <p className="min-w-0 flex-1 truncate font-medium">
                {item.title}
              </p>
              <Badge variant={STATUS_BADGE_VARIANT[item.status]}>
                {ITEM_STATUS_LABEL[item.status]}
              </Badge>
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {item.description}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDate(item.created_at)} · {item.images.length} 张照片
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href={`/me/items/${item.id}/pickups`} />}
              >
                <UsersIcon aria-hidden />
                查看认领人
              </Button>
              {published ? <MeItemActions itemId={item.id} /> : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </MeItemShell>
  )
}

function MyPickupCard({
  pickup,
  meta,
}: {
  pickup: Pickup
  meta: PickupItemMeta | undefined
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <CardTitle className="truncate">
            {meta ? meta.title : "物品不可见"}
          </CardTitle>
          <Badge variant="outline">
            {meta ? ITEM_STATUS_LABEL[meta.status] : "不可见"}
          </Badge>
        </div>
        <CardDescription>{formatDate(pickup.created_at)} 提交</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-2 text-sm">
        <p>姓名：{pickup.picker_name}</p>
        <p>手机号：{pickup.picker_phone}</p>
        {meta ? (
          <Button
            size="sm"
            variant="ghost"
            nativeButton={false}
            render={<Link href={`/items/${pickup.found_item_id}`} />}
          >
            查看物品
          </Button>
        ) : null}
        <RevealContact itemId={pickup.found_item_id} />
      </CardContent>
    </Card>
  )
}

export default async function MePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const supabase = await createClient()

  let data: MeData
  try {
    data = await loadMeData(supabase, user.id)
  } catch (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>加载失败</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : "请稍后重试"}
        </AlertDescription>
      </Alert>
    )
  }

  const published =
    data.items.length === 0 ? (
      <Empty className="my-auto flex-none">
        <EmptyMedia variant="icon">
          <ImageIcon aria-hidden />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>还没有发布</EmptyTitle>
          <EmptyDescription>拍几张照片就能发布</EmptyDescription>
        </EmptyHeader>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href="/" />}
        >
          去失物墙
        </Button>
      </Empty>
    ) : (
      data.items.map((item) => <MyItemCard key={item.id} item={item} />)
    )

  const pickups = (
    <>
      {data.pickups.length === 0 ? (
        <Empty className="my-auto flex-none">
          <EmptyMedia variant="icon">
            <InboxIcon aria-hidden />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>还没有认领</EmptyTitle>
            <EmptyDescription>找到自己的物品，提交认领信息</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        data.pickups.map((pickup) => (
          <MyPickupCard
            key={pickup.id}
            pickup={pickup}
            meta={data.pickupItems[pickup.found_item_id]}
          />
        ))
      )}
      <p className="pt-1 text-xs text-muted-foreground">
        认领后物品会标记为已认领，归还后无需再操作
      </p>
    </>
  )

  return (
    <MeTabs
      publishedCount={data.items.length}
      pickupCount={data.pickups.length}
      published={published}
      pickups={pickups}
    />
  )
}
