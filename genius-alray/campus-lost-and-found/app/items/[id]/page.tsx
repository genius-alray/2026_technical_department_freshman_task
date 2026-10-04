import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ClockIcon, HandHeartIcon } from "lucide-react"

import { PageTitle } from "@/components/nav/title-bar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  getItem,
  listImagesForItems,
  revealContact,
} from "@/lib/db/found-items"
import { signPathsInOrder } from "@/lib/storage/signed"
import { createClient, getCurrentUser } from "@/lib/supabase/server"
import { ITEM_STATUS_LABEL } from "@/lib/types"
import type { RevealedContact } from "@/lib/types"

import { formatDateTime } from "../format"
import { ItemGallery } from "./item-gallery"
import { RevealCard } from "./reveal-card"

export const metadata: Metadata = {
  title: "物品详情 · 校园失物招领",
}

export const dynamic = "force-dynamic"

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const { id } = await params
  const supabase = await createClient()

  // getItem 只取公开列；contact / location 在列级被 REVOKE，这里根本拿不到
  const item = await getItem(supabase, id)
  if (!item) notFound()

  const images = await listImagesForItems(supabase, [id])
  const signed = await signPathsInOrder(
    images.map((image) => image.storage_path)
  )

  const isOwner = item.owner_id === user.id

  // 只有「已被认领」才谈得上揭晓：认领人本人拿到联系方式，其他人拿到 null
  let revealed: RevealedContact | null = null
  if (!isOwner && item.status === "claimed") {
    try {
      revealed = await revealContact(supabase, id)
    } catch {
      revealed = null
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-5">
      {/* 标题栏（全局）已显示物品名称，正文里不再重复大标题；返回与 item-back 走路由默认 */}
      <PageTitle title={item.title} />

      <ItemGallery images={signed} title={item.title} />

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <Badge variant={item.status === "published" ? "default" : "outline"}>
            {ITEM_STATUS_LABEL[item.status]}
          </Badge>
          <p className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <ClockIcon className="size-3.5" aria-hidden />
            {formatDateTime(item.created_at)} 发布
          </p>
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {item.description}
        </p>
      </div>

      {isOwner ? (
        item.status === "withdrawn" ? (
          <Alert data-testid="pickup-withdrawn">
            <AlertTitle>已撤单</AlertTitle>
          </Alert>
        ) : (
          <Alert data-testid="item-owner-notice">
            <AlertDescription>
              {item.status === "claimed"
                ? "已被认领，认领人名单在"
                : "这是你发布的，认领人名单在"}
              <Link href="/me" className="underline underline-offset-4">
                「我的认领」
              </Link>
            </AlertDescription>
          </Alert>
        )
      ) : revealed ? (
        <div data-testid="pickup-success">
          <RevealCard revealed={revealed} />
        </div>
      ) : item.status === "claimed" ? (
        <Alert data-testid="pickup-claimed">
          <AlertTitle>已被认领</AlertTitle>
        </Alert>
      ) : item.status === "withdrawn" ? (
        <Alert data-testid="pickup-withdrawn">
          <AlertTitle>已撤单</AlertTitle>
        </Alert>
      ) : (
        <Button
          size="lg"
          className="h-12 w-full text-base"
          nativeButton={false}
          render={<Link href={"/items/" + item.id + "/claim"} />}
          data-testid="pickup-open"
        >
          <HandHeartIcon aria-hidden />
          这是我的，我要认领
        </Button>
      )}
    </div>
  )
}
