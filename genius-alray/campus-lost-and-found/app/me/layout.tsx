import { LogOutIcon } from "lucide-react"
import { redirect } from "next/navigation"

import { AppHeader } from "@/components/nav/app-header"
import { Button } from "@/components/ui/button"
import { createClient, getCurrentUser } from "@/lib/supabase/server"

import { signOutAction } from "./actions"

export default async function MeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle()

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-6">
      <AppHeader
        title="我的"
        subtitle={profile?.username ?? user.email}
        backHref="/"
        action={
          <form action={signOutAction}>
            <Button type="submit" size="sm" variant="outline">
              <LogOutIcon aria-hidden />
              退出登录
            </Button>
          </form>
        }
      />
      {children}
    </div>
  )
}
