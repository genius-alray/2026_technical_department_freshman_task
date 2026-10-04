"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import type { FormEvent } from "react"

import { SuccessOverlay } from "@/components/motion/primitives"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import { createPickupAction } from "../../actions"

/**
 * 认领独立一屏：只问姓名与手机号；成功整屏对勾约 1s，再回详情看揭晓。
 *
 * 【注意】认领成功后服务端会 revalidate，本组件会带着 claimedByMe=true 重新渲染。
 * 因此这里**必须保持同一个组件实例**（不要根据 status 换渲染分支到别的组件），
 * 否则 done/timer 的状态会被重置，「认领成功」对勾就没了。
 * claimedByMe && !done 只用于「已经认领过、再次进来」的场景。
 */
export function ClaimForm({
  itemId,
  claimedByMe = false,
}: {
  itemId: string
  claimedByMe?: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
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

        <p className="text-xs text-muted-foreground">姓名和手机号会给拾主</p>

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
  )
}
