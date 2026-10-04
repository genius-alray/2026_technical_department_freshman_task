import { MapPinIcon, PhoneIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { RevealedContact } from "@/lib/types"

/** 认领后揭晓：拾主的联系方式或物品所在位置。 */
export function RevealCard({ revealed }: { revealed: RevealedContact }) {
  const hasCoords =
    revealed.location_lat !== null && revealed.location_lng !== null
  const hasLocation = hasCoords || Boolean(revealed.location_label)

  return (
    <Card data-testid="pickup-revealed">
      <CardHeader>
        <CardTitle>
          {revealed.custody === "kept" ? "拾主的联系方式" : "物品所在位置"}
        </CardTitle>
        <CardDescription data-testid="pickup-recorded">
          已记录你的认领信息。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {revealed.custody === "kept" ? (
          <p
            data-testid="reveal-contact"
            className="flex items-center gap-2 text-base font-medium"
          >
            <PhoneIcon className="size-4" aria-hidden />
            {revealed.contact || "拾主未填写联系方式"}
          </p>
        ) : (
          <div data-testid="reveal-location" className="flex flex-col gap-1">
            {revealed.location_label ? (
              <p className="text-base font-medium">{revealed.location_label}</p>
            ) : null}
            {hasCoords ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {revealed.location_lat?.toFixed(5)},{" "}
                  {revealed.location_lng?.toFixed(5)}
                </p>
                <a
                  className="flex w-fit items-center gap-1 text-sm underline underline-offset-4"
                  href={
                    "https://www.openstreetmap.org/?mlat=" +
                    revealed.location_lat +
                    "&mlon=" +
                    revealed.location_lng +
                    "#map=18/" +
                    revealed.location_lat +
                    "/" +
                    revealed.location_lng
                  }
                  target="_blank"
                  rel="noreferrer"
                  data-testid="reveal-map-link"
                >
                  <MapPinIcon className="size-4" aria-hidden />
                  在地图中打开
                </a>
              </>
            ) : null}
            {!hasLocation ? (
              <p className="text-sm text-muted-foreground">
                拾主未填写位置信息。
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
