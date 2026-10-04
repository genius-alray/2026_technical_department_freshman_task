"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import type { FormEvent } from "react"

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
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { pickupSchema } from "@/lib/validation/schemas"

import { createPickupAction } from "../../actions"

/**
 * 认领独立一屏：姓名与手机号（来自「我的信息」的预填），
 * 点「确认认领」先弹「诚信认领」二次确认，确认后才提交；
 * 成功整屏对勾约 1s，再回详情看揭晓。
 *
 * 【注意】认领成功后服务端会 revalidate，本组件会带着 claimedByMe=true 重新渲染。
 * 因此这里**必须保持同一个组件实例**（不要根据 status 换渲染分支到别的组件），
 * 否则 done/timer 的状态会被重置，「认领成功」对勾就没了。
 * claimedByMe && !done 只用于「已经认领过、再次进来」的场景。
 */
export function ClaimForm({
  itemId,
  claimedByMe = false,
  defaultName = "",
  defaultPhone = "",
  profileComplete = false,
}: {
  itemId: string
  claimedByMe?: boolean
  defaultName?: string
  defaultPhone?: string
  profileComplete?: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState(defaultName)
  const [phone, setPhone] = useState(defaultPhone)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  /** 只做前端校验；通过后进入二次确认，不直接提交 */
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = pickupSchema.safeParse({ itemId, name, phone })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "请检查填写内容")
      return
    }
    setError(null)
    setConfirmOpen(true)
  }

  /** 二次确认后才真正认领 */
  function confirm() {
    setConfirmOpen(false)
    setError(null)
    startTransition(async () => {
      const result = await createPickupAction({ itemId, name, phone })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setDone(true)
      timerRef.current = window.setTimeout(() => {
        router.replace("/items/" + itemId)
      }, 900)
    })
  }

  if (claimedByMe && !done) {
    return (
      <div className="my-auto flex min-w-0 flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          你已经认领过这件物品，联系方式在详情页。
        </p>
        <Button
          type="button"
          size="lg"
          className="h-12 w-full text-base"
          data-testid="pickup-back"
          onClick={() => router.replace("/items/" + itemId)}
        >
          返回物品
        </Button>
      </div>
    )
  }

  return (
    <>
      <form
        data-testid="pickup-form"
        className="flex min-w-0 flex-1 flex-col"
        onSubmit={submit}
      >
        <div className="my-auto flex min-w-0 flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="pickup-name">真实姓名</FieldLabel>
            <Input
              id="pickup-name"
              data-testid="pickup-name"
              value={name}
              maxLength={20}
              autoComplete="name"
              placeholder="例如：张三"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="pickup-phone">手机号</FieldLabel>
            <Input
              id="pickup-phone"
              data-testid="pickup-phone"
              value={phone}
              maxLength={20}
              inputMode="tel"
              autoComplete="tel"
              placeholder="例如：13800138000"
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>

          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">
              {profileComplete
                ? "已保存，可直接认领"
                : "填一次，以后认领直接用"}
            </p>
            <p className="text-xs text-muted-foreground">
              姓名和手机号会给拾主
            </p>
          </div>

          {error ? (
            <Alert variant="destructive" data-testid="pickup-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button
            type="submit"
            size="lg"
            className="h-12 w-full text-base"
            data-testid="pickup-submit"
            disabled={pending}
          >
            {pending ? "正在认领…" : "确认认领"}
          </Button>
        </div>

        <SuccessOverlay show={done} testId="claim-success" message="认领成功" />
      </form>

      <Dialog open={confirmOpen} onOpenChange={(next) => setConfirmOpen(next)}>
        <DialogContent data-testid="claim-confirm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>诚信认领</DialogTitle>
            <DialogDescription>
              请确认这是你本人的物品。冒领会占用失主的找回机会；错拿请及时联系拾主，偷窃需承担法律责任。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              data-testid="claim-confirm-cancel"
              onClick={() => setConfirmOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              data-testid="claim-confirm-ok"
              disabled={pending}
              onClick={confirm}
            >
              我确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
