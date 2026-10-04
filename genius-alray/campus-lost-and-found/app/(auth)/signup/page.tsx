import type { Metadata } from "next"
import Link from "next/link"

import { FadeIn } from "@/components/motion/primitives"

import { safeNextPath } from "../next-path"
import { SignUpForm } from "./signup-form"

export const metadata: Metadata = {
  title: "注册 · 校园失物招领",
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const params = await searchParams
  const raw = Array.isArray(params.next) ? params.next[0] : params.next
  const nextPath = safeNextPath(raw)

  return (
    <FadeIn>
      <div className="my-auto flex w-full flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            注册
          </h1>
          <p className="text-sm text-muted-foreground">无需邮箱，注册即可用</p>
        </div>

        <SignUpForm nextPath={nextPath} />

        <p className="text-center text-sm text-muted-foreground">
          已有账号？
          <Link
            href="/login"
            className="ml-1 text-primary underline-offset-4 hover:underline"
          >
            去登录
          </Link>
        </p>
      </div>
    </FadeIn>
  )
}
