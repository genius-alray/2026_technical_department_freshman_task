import { redirect } from "next/navigation"

import { getAppConfig } from "@/lib/db/found-items"
import { getMyProfile } from "@/lib/db/profiles"
import { createClient, getCurrentUser } from "@/lib/supabase/server"

import { PublishClient } from "./publish-client"

export const dynamic = "force-dynamic"

export default async function PublishPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const supabase = await createClient()
  const [config, profile] = await Promise.all([
    getAppConfig(supabase),
    getMyProfile(supabase, user.id),
  ])

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-6">
      <PublishClient
        maxPhotos={config?.max_photos ?? 3}
        defaultContact={profile?.phone ?? ""}
      />
    </div>
  )
}
