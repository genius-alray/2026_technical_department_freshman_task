import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { CheckIcon, HandHeartIcon, ShieldCheckIcon } from "lucide-react"

import { LocationLink } from "@/components/contact/location-link"
import { PhoneLink } from "@/components/contact/phone-link"
import { PageTitle } from "@/components/nav/title-bar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getItem, revealContact } from "@/lib/db/found-items"
import { getMyPickup } from "@/lib/db/pickups"
import { createClient, getCurrentUser } from "@/lib/supabase/server"
import type { RevealedContact } from "@/lib/types"

import { formatDateTime } from "../../format"

export const metadata: Metadata = {
  title: "认领信息 · 校园失物招领",
}

export const dynamic = "force-dynamic"

const GUIDES = [
  "联系拾主或前往拾主留下的位置，核对物品细节",
  "确认无误后当面取回，并把结果告知拾主",
  "如果发现拿错了，请立刻联系拾主归还",
]

/** 认领成功后的独立一屏：认领指引 + 拾主联系方式/位置 + 我的认领信息 */
export default async function ClaimInfoPage({
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

  const pickup = await getMyPickup(supabase, id, user.id)
  // 没认领过的人不该停在这一屏（退回详情页）
  if (!pickup) redirect("/items/" + id)

  let revealed: RevealedContact | null = null
  try {
    revealed = await revealContact(supabase, id)
  } catch {
    revealed = null
  }

  const hasCoords =
    revealed !== null &&
    revealed.location_lat !== null &&
    revealed.location_lng !== null
  const isInPlace = revealed?.custody === "in_place"

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-5">
      <PageTitle title="认领信息" />

      <Card data-testid="claim-guide">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="size-4" aria-hidden />
            认领指引
          </CardTitle>
          <CardDescription>诚信认领，错拿请及时归还。</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-2 text-sm">
            {GUIDES.map((guide, index) => (
              <li key={guide} className="flex gap-2">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
                  {index + 1}
                </span>
                <span className="min-w-0 text-muted-foreground">{guide}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card data-testid="pickup-revealed">
        <CardHeader>
          <CardTitle>{isInPlace ? "物品所在位置" : "拾主的联系方式"}</CardTitle>
          <CardDescription>联系时请说明物品名称与特征。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {isInPlace ? (
            hasCoords || revealed?.location_label ? (
              <div data-testid="reveal-location">
                <LocationLink
                  label={revealed?.location_label ?? null}
                  lat={revealed?.location_lat ?? null}
                  lng={revealed?.location_lng ?? null}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                拾主未填写位置信息，请等拾主联系你。
              </p>
            )
          ) : revealed?.contact ? (
            <div data-testid="reveal-contact">
              <PhoneLink phone={revealed.contact} className="text-base" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              拾主未填写联系方式。
            </p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="claim-info">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HandHeartIcon className="size-4" aria-hidden />
            我的认领信息
          </CardTitle>
          <CardDescription>
            {formatDateTime(pickup.created_at)} 提交
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p className="flex items-center gap-1.5">
            <CheckIcon className="size-4 shrink-0" aria-hidden />
            <span data-testid="claim-info-name">{pickup.picker_name}</span>
          </p>
          <PhoneLink phone={pickup.picker_phone} />
        </CardContent>
      </Card>

      <Alert>
        <AlertTitle>物品已标记为已认领</AlertTitle>
        <AlertDescription>
          归还后无需操作；若拿错了请立刻联系拾主。
        </AlertDescription>
      </Alert>

      <Button
        size="lg"
        className="h-12 w-full text-base"
        nativeButton={false}
        render={<Link href={"/items/" + item.id} />}
        data-testid="claim-back-item"
      >
        返回物品详情
      </Button>
    </div>
  )
}
