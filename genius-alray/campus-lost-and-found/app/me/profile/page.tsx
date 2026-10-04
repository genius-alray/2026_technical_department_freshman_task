import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getMyProfile } from "@/lib/db/profiles"
import { createClient, getCurrentUser } from "@/lib/supabase/server"

import { ProfileForm } from "./profile-form"

export const metadata: Metadata = {
  title: "我的信息 · 校园失物招领",
}

export default async function MeProfilePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const supabase = await createClient()
  const profile = await getMyProfile(supabase, user.id)

  return (
    <div className="flex min-w-0 flex-1 flex-col px-4 py-4">
      <ProfileForm
        defaultName={profile?.real_name ?? ""}
        defaultPhone={profile?.phone ?? ""}
      />
    </div>
  )
}
