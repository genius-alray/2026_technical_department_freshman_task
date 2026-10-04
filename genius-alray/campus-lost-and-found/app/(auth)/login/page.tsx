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
import { LoginForm } from "./login-form"

export const metadata: Metadata = {
  title: "登录 · 校园失物招领",
}

export default async function LoginPage({
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
          <CardTitle className="text-xl">登录</CardTitle>
          <CardDescription>用用户名登录</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <LoginForm nextPath={nextPath} />
          <p className="text-center text-sm text-muted-foreground">
            还没有账号？
            <Link
              href="/signup"
              className="ml-1 text-primary underline-offset-4 hover:underline"
            >
              去注册
            </Link>
          </p>
        </CardContent>
      </Card>
    </FadeIn>
  )
}
