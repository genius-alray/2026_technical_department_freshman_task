import type { Metadata } from "next"
import Link from "next/link"

import { FadeIn } from "@/components/motion/primitives"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

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
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl">注册</CardTitle>
          <CardDescription>无需邮箱，注册即可用</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
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
        </CardContent>
      </Card>
    </FadeIn>
  )
}
