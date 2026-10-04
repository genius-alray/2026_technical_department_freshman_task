"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { HandHeartIcon } from "lucide-react"

import { PhoneLink } from "@/components/contact/phone-link"
import { SuccessOverlay } from "@/components/motion/primitives"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Profile } from "@/lib/types"

import { createPickupAction } from "../actions"

/**
 * 详情页底部的认领入口。
 *
 * 认领的**二次确认发生在点击时**：
 * - 没有个人信息 → 先提醒「需要补充个人信息才能认领」，选「去填写」跳到个人信息页（保存后回到本页）
 * - 有个人信息 → 直接弹「诚信认领」确认框，里面展示自己的姓名与手机号
 * 确认后认领，并把用户送到独立的「认领信息」屏看指引与拾主联系方式。
 */
export function ClaimActions({
  itemId,
  profile,
  claimedByMe,
}: {
  itemId: string
  profile: Profile | null
  claimedByMe: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [needProfile, setNeedProfile] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const timerRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  const profilePath = "/items/" + itemId + "/claim"
  const complete = Boolean(profile?.real_name && profile.phone)

  if (claimedByMe) {
    return (
      <Button
        size="lg"
        className="h-12 w-full text-base"
        nativeButton={false}
        render={<Link href={profilePath} />}
        data-testid="pickup-view-info"
      >
        <HandHeartIcon aria-hidden />
        查看认领信息
      </Button>
    )
  }

  function openClaim() {
    setError(null)
    if (complete) {
      setOpen(true)
      return
    }
    setNeedProfile(true)
  }

  function confirm() {
    setError(null)
    startTransition(async () => {
      const result = await createPickupAction({
        itemId,
        name: profile?.real_name ?? "",
        phone: profile?.phone ?? "",
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      setDone(true)
      timerRef.current = window.setTimeout(() => {
        router.push(profilePath)
      }, 900)
    })
  }

  return (
    <>
      <Button
        size="lg"
        className="h-12 w-full text-base"
        data-testid="pickup-open"
        disabled={pending}
        onClick={openClaim}
      >
        <HandHeartIcon aria-hidden />
        这是我的，我要认领
      </Button>

      {/* 没有个人信息：先提醒补充 */}
      <Dialog open={needProfile} onOpenChange={setNeedProfile}>
        <DialogContent
          showCloseButton={false}
          className="max-w-xs gap-4"
          data-testid="claim-need-profile"
        >
          <DialogHeader>
            <DialogTitle>需要补充个人信息才能认领</DialogTitle>
            <DialogDescription>
              认领要留下真实姓名与手机号，方便拾主核对。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              data-testid="claim-need-profile-cancel"
              onClick={() => setNeedProfile(false)}
            >
              取消
            </Button>
            <Button
              data-testid="claim-go-profile"
              nativeButton={false}
              render={
                <Link
                  href={"/me/profile?next=" + encodeURIComponent(profilePath)}
                />
              }
            >
              去填写
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 有个人信息：诚信认领二次确认 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="gap-4"
          data-testid="claim-confirm"
        >
          <DialogHeader>
            <DialogTitle>诚信认领</DialogTitle>
            <DialogDescription>
              请确认这是你本人的物品。冒领会占用失主的找回机会；错拿请及时联系拾主，偷窃需承担法律责任。
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1 rounded-2xl bg-muted/60 px-3 py-2 text-sm">
            <span className="text-xs text-muted-foreground">
              将提交你的信息
            </span>
            <span data-testid="claim-confirm-name">{profile?.real_name}</span>
            {profile?.phone ? <PhoneLink phone={profile.phone} /> : null}
          </div>

          {error ? (
            <Alert variant="destructive" data-testid="claim-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              data-testid="claim-confirm-cancel"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              data-testid="claim-confirm-ok"
              disabled={pending}
              onClick={confirm}
            >
              {pending ? "正在认领…" : "我确认认领"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SuccessOverlay show={done} message="认领成功" testId="claim-success" />
    </>
  )
}
