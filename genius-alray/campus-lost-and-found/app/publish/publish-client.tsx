"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CameraIcon, Trash2Icon } from "lucide-react"

import {
  DURATION,
  FadeIn,
  LoadingOverlay,
  StaggerItem,
  StaggerList,
  StepTransition,
  SuccessOverlay,
  TapScale,
} from "@/components/motion/primitives"
import { PhoneText } from "@/components/contact/phone-link"
import { PageTitle } from "@/components/nav/title-bar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

import {
  analyzeItemAction,
  publishItemAction,
  reviewPhotosAction,
} from "./actions"
import type { CustodyKind } from "@/lib/types"

// 与 lib/storage/validate.ts 保持一致（该模块 import 了 server-only，客户端不能引用）
const MAX_EDGE = 1600
const JPEG_QUALITY = 0.8
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
/**
 * 识别看门狗：真实 provider（generateObject）没有显式超时，
 * 挂起时全屏 LoadingOverlay 会盖住「返回」，用户将永久卡在第 2 屏。
 * 超时后退化成「识别失败，自己填一下」+「识别物品」重试。
 */
const ANALYZE_TIMEOUT_MS = 25_000

type Phase = "idle" | "uploading" | "publishing"
type AnalyzeState = "idle" | "running" | "done" | "error"

type Photo = { path: string; preview: string }

type Props = {
  maxPhotos: number
  /** 账号里的手机号：选「代为保管」时直接用，不再让用户填 */
  defaultContact: string
}

/** 浏览器端压缩：最长边 ≤1600px、jpeg、质量 0.8，并压到 ≤2MB */
async function loadSource(
  file: File
): Promise<{ source: ImageBitmap | HTMLImageElement; revoke: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file)
      return { source: bitmap, revoke: () => bitmap.close() }
    } catch {
      // 某些浏览器/格式无法直接解码，退回 <img> 路径
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { source: image, revoke: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    throw new Error("这张照片无法读取，请换一张（支持 jpeg / png / webp）")
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("照片压缩失败"))
      },
      "image/jpeg",
      quality
    )
  })
}

async function compressImage(file: File): Promise<File> {
  const { source, revoke } = await loadSource(file)
  const longest = Math.max(source.width, source.height)
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) {
    revoke()
    throw new Error("当前浏览器不支持照片压缩")
  }
  context.drawImage(source, 0, 0, width, height)
  revoke()

  let quality = JPEG_QUALITY
  let blob = await canvasToBlob(canvas, quality)
  while (blob.size > MAX_IMAGE_BYTES && quality > 0.4) {
    quality = Math.round((quality - 0.15) * 100) / 100
    blob = await canvasToBlob(canvas, quality)
  }
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error("照片压缩后仍超过 2MB，请换一张或降低分辨率")
  }

  const baseName = file.name.replace(/\.[^./\\]+$/, "") || "photo"
  return new File([blob], baseName + ".jpg", { type: "image/jpeg" })
}

async function uploadImage(file: File, batchId: string) {
  const form = new FormData()
  form.append("file", file)
  form.append("batchId", batchId)

  const response = await fetch("/api/upload", { method: "POST", body: form })
  const data = (await response.json().catch(() => null)) as {
    path?: string
    error?: string
  } | null
  if (!response.ok || !data?.path) {
    throw new Error(data?.error ?? "照片上传失败，请重试")
  }
  return data.path
}

function errorTitle(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function PublishClient({ maxPhotos, defaultContact }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)

  const [batchId] = useState(() => crypto.randomUUID())
  const [photos, setPhotos] = useState<Photo[]>([])
  const [removing, setRemoving] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>("idle")
  const [uploadNote, setUploadNote] = useState("")

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [analyzeState, setAnalyzeState] = useState<AnalyzeState>("idle")
  const [analyzedKey, setAnalyzedKey] = useState("")
  /** 点「下一步」时正在让 AI 看一遍照片 */
  const [checking, setChecking] = useState(false)
  /** 非空 = 「建议补拍」对话框打开，内容是 AI 的一句话理由 */
  const [retakeReason, setRetakeReason] = useState<string | null>(null)

  const [custody, setCustody] = useState<CustodyKind | "">("")
  const [contact] = useState(defaultContact)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  )
  const [locationLabel, setLocationLabel] = useState("")
  const [locating, setLocating] = useState(false)
  const [published, setPublished] = useState(false)

  const paths = photos.map((photo) => photo.path)
  /** 照片集合的指纹：变化即需要重新识别 */
  const analysisKey = paths.join("|")

  const pathsRef = useRef<string[]>([])
  const keyRef = useRef("")
  const requestedRef = useRef("")
  /** 上一次真正发起识别的照片指纹：同一个 key 的重试不清空用户写过的内容 */
  const lastAnalyzeKeyRef = useRef("")
  /** 识别请求序号：看门狗超时后，迟到的返回不能再落地 */
  const analyzeSeqRef = useRef(0)
  /** 防止连点「下一步」重复发起检查 */
  const checkBusyRef = useRef(false)
  /** 用户是否改过字段：识别结果不覆盖手写内容 */
  const editedRef = useRef({ title: false, description: false })

  useEffect(() => {
    pathsRef.current = photos.map((photo) => photo.path)
  }, [photos])

  useEffect(() => {
    keyRef.current = analysisKey
  }, [analysisKey])

  // 预览 URL 只在卸载时统一释放（预览是纯客户端效果，不进入发布数据）
  const previewsRef = useRef<string[]>([])
  useEffect(() => {
    previewsRef.current = photos.map((photo) => photo.preview)
  }, [photos])
  useEffect(() => {
    return () => {
      for (const url of previewsRef.current) URL.revokeObjectURL(url)
    }
  }, [])

  const runAnalyze = useCallback(async (key: string) => {
    const seq = (analyzeSeqRef.current += 1)

    // 换了照片才清掉上一组的 AI 文案；同一组照片的「识别物品」重试保留用户已写内容
    const isRetry = key === lastAnalyzeKeyRef.current
    lastAnalyzeKeyRef.current = key
    if (!isRetry) {
      editedRef.current = { title: false, description: false }
      setTitle("")
      setDescription("")
    }

    setAnalyzeState("running")

    // 看门狗：provider 挂起时给用户一个出口（mock 固定会返回，E2E 走不到）
    const watchdog = window.setTimeout(() => {
      if (seq !== analyzeSeqRef.current) return
      analyzeSeqRef.current += 1 // 让迟到的返回作废
      setAnalyzeState("error")
    }, ANALYZE_TIMEOUT_MS)

    try {
      const result = await analyzeItemAction(pathsRef.current)
      if (seq !== analyzeSeqRef.current || key !== keyRef.current) return
      if (!result.ok) {
        setAnalyzeState("error")
        return
      }
      const { title: nextTitle, description: nextDescription } = result.result
      if (nextTitle) {
        setTitle((prev) => (editedRef.current.title ? prev : nextTitle))
      }
      if (nextDescription) {
        setDescription((prev) =>
          editedRef.current.description ? prev : nextDescription
        )
      }
      setAnalyzedKey(key)
      setAnalyzeState("done")
    } catch {
      if (seq === analyzeSeqRef.current && key === keyRef.current) {
        setAnalyzeState("error")
      }
    } finally {
      window.clearTimeout(watchdog)
    }
  }, [])

  // 进入第 2 屏自动识别；照片集合变化后重新识别
  useEffect(() => {
    if (step !== 1 || !analysisKey) return
    if (analyzedKey === analysisKey || requestedRef.current === analysisKey) {
      return
    }
    requestedRef.current = analysisKey
    void runAnalyze(analysisKey)
  }, [step, analysisKey, analyzedKey, runAnalyze])

  // 发布成功后盖屏约 900ms，再回首页
  useEffect(() => {
    if (!published) return
    const timer = window.setTimeout(() => router.push("/"), 900)
    return () => window.clearTimeout(timer)
  }, [published, router])

  const busy = isPending || phase !== "idle"
  const remaining = Math.max(0, maxPhotos - photos.length)
  const canLeavePhotoStep = photos.length > 0 && !busy && !checking
  const canLeaveInfoStep =
    title.trim().length > 0 && description.trim().length > 0 && !busy

  /** 标题栏的「返回」：第 2/3 屏退回上一步（稳定引用，避免每次渲染都重注册） */
  const handleHeaderBack = useCallback(() => {
    goTo(step - 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  function goTo(next: number) {
    setDirection(next > step ? 1 : -1)
    // 第 2 屏：先同步进入加载态，避免 effect 生效前渲染出一帧空表单；
    // 只有确实会发起识别时才置 running（重试态/已识别过的不置，否则会卡住）
    if (
      next === 1 &&
      analyzedKey !== analysisKey &&
      requestedRef.current !== analysisKey
    ) {
      setAnalyzeState("running")
    }
    setStep(next)
  }

  /**
   * 拍照屏的「下一步」：只在这里让 AI 看一次照片。
   * - 通过 / 服务端失败 / 异常 → 直接进第 2 屏（建议永远不阻塞，也不弹错误）；
   * - 建议补拍 → 只弹一个对话框，用户可以「仍然继续」。
   */
  async function handlePhotoNext() {
    if (checkBusyRef.current || photos.length === 0) return
    checkBusyRef.current = true
    setChecking(true)
    try {
      const result = await reviewPhotosAction(pathsRef.current)
      if (result.ok && !result.advice.ok) {
        setRetakeReason(result.advice.reason.trim() || "换个角度再拍一张")
        return
      }
      goTo(1)
    } catch {
      // 服务端失败静默降级：直接进入第 2 屏
      goTo(1)
    } finally {
      checkBusyRef.current = false
      setChecking(false)
    }
  }

  function openPicker() {
    inputRef.current?.click()
  }

  function run(task: () => Promise<void>) {
    startTransition(async () => {
      try {
        await task()
      } catch (error) {
        toast.add({
          type: "error",
          title: errorTitle(error, "操作失败，请重试"),
        })
      } finally {
        setPhase("idle")
        setUploadNote("")
      }
    })
  }

  function handleFiles(files: File[]) {
    if (files.length === 0) return
    run(async () => {
      if (remaining === 0) {
        toast.add({
          type: "error",
          title: "每个物品最多 " + maxPhotos + " 张照片",
        })
        return
      }

      const batch = files.slice(0, remaining)
      if (batch.length < files.length) {
        toast.add({
          type: "info",
          title: "最多再上传 " + remaining + " 张，已忽略多余照片",
        })
      }

      setPhase("uploading")
      const uploaded: Photo[] = []

      for (let index = 0; index < batch.length; index += 1) {
        setUploadNote("正在上传第 " + (index + 1) + "/" + batch.length + " 张…")
        const compressed = await compressImage(batch[index])
        const path = await uploadImage(compressed, batchId)
        const photo = { path, preview: URL.createObjectURL(compressed) }
        uploaded.push(photo)
        // 逐张入 state：整批中途失败时，已成功的照片不能丢（否则预览 URL 与存储对象都成孤儿）
        pathsRef.current = [...pathsRef.current, photo.path]
        setPhotos((prev) => [...prev, photo])
      }

      toast.add({
        type: "success",
        title: "已上传 " + uploaded.length + " 张照片",
      })
    })
  }

  function removePhoto(path: string) {
    // 先拿到要释放的预览（setState updater 必须是纯函数，不能在里面 revoke）
    const target = photos.find((photo) => photo.path === path)
    setRemoving((prev) => (prev.includes(path) ? prev : [...prev, path]))
    window.setTimeout(() => {
      if (target) URL.revokeObjectURL(target.preview)
      setPhotos((prev) => prev.filter((photo) => photo.path !== path))
      setRemoving((prev) => prev.filter((item) => item !== path))
      pathsRef.current = pathsRef.current.filter((item) => item !== path)
    }, DURATION.fast * 1000)
  }

  function retryAnalyze() {
    if (!analysisKey || analyzeState === "running") return
    requestedRef.current = analysisKey
    void runAnalyze(analysisKey)
  }

  function locate() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      toast.add({
        type: "error",
        title: "当前浏览器不支持定位，请填写位置描述",
      })
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        })
        setLocating(false)
        toast.add({ type: "success", title: "已获取当前位置" })
      },
      () => {
        setCoords(null)
        setLocating(false)
        toast.add({
          type: "error",
          title: "定位失败或被拒绝，请填写位置描述",
        })
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  /** 点选一张卡片后，进入下一屏做详细设置（联系方式自动用账号手机号 / 设置存放位置） */
  function pickCustody(next: CustodyKind) {
    setDirection(1)
    setCustody(next)
    setStep(3)
    if (next === "in_place" && !coords) locate()
  }

  function handlePublish() {
    run(async () => {
      if (paths.length === 0) {
        toast.add({ type: "error", title: "请至少上传一张照片" })
        return
      }
      if (!title.trim()) {
        toast.add({ type: "error", title: "请填写物品名称" })
        return
      }
      if (!description.trim()) {
        toast.add({ type: "error", title: "请填写物品描述" })
        return
      }
      if (!custody) {
        toast.add({ type: "error", title: "请选择保管方式" })
        return
      }
      if (custody === "kept" && contact.trim().length < 5) {
        toast.add({
          type: "error",
          title: "账号缺少手机号，请先在「我的」里补充",
        })
        return
      }
      if (
        custody === "in_place" &&
        !coords &&
        locationLabel.trim().length < 1
      ) {
        toast.add({ type: "error", title: "请允许定位或填写位置描述" })
        return
      }

      setPhase("publishing")
      const result = await publishItemAction({
        paths,
        title: title.trim(),
        description: description.trim(),
        custody,
        contact: contact.trim(),
        locationLabel: locationLabel.trim(),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      })
      if (!result.ok) {
        toast.add({ type: "error", title: result.error })
        return
      }

      // 【第 7 轮】不再弹 toast：整屏对勾（SuccessOverlay）已经是很强的正向反馈
      setPublished(true)
    })
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      {/*
        标题栏由 layout 统一提供（components/nav/title-bar.tsx），页面里不再自己画。
        这里只覆盖「返回」：第 2/3 屏退回上一步，第 1 屏沿用路由默认（回首页）。
        onBack 用 useCallback 稳定引用，避免每次渲染都重新注册标题栏配置。
      */}
      <PageTitle
        title="发布招领"
        onBack={step === 0 ? undefined : handleHeaderBack}
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(event) => {
          // FileList 是「活」的：必须先拷成数组再清空 input
          const files = Array.from(event.target.files ?? [])
          event.target.value = ""
          handleFiles(files)
        }}
      />

      <StepTransition
        stepKey={step}
        direction={direction}
        className="flex min-w-0 flex-1 flex-col"
      >
        {step === 0 ? (
          // 这一屏只做拍照，内容不多：整块（大按钮 / 网格 + 下一步）垂直居中
          <div className="my-auto flex min-w-0 flex-col gap-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              把物品放在光线好的地方，拍清楚整体和明显的特征。
            </p>

            {/* 照片列表：最后一个是「添加照片」，没有照片时它就是上传按钮 */}
            <StaggerList className="grid grid-cols-3 gap-2">
              {photos.map((photo) => (
                <StaggerItem
                  key={photo.path}
                  className={cn(
                    "relative overflow-hidden rounded-xl bg-muted transition-opacity duration-[180ms]",
                    removing.includes(photo.path) ? "opacity-0" : "opacity-100"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.preview}
                    alt="已上传照片"
                    className="h-24 w-full object-cover"
                  />
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="destructive"
                    aria-label="删除这张照片"
                    className="absolute top-1 right-1"
                    disabled={busy}
                    onClick={() => removePhoto(photo.path)}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                </StaggerItem>
              ))}

              {photos.length < maxPhotos ? (
                <StaggerItem key="add-photo">
                  <button
                    type="button"
                    data-testid="photo-add"
                    disabled={busy}
                    onClick={openPicker}
                    className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-xl bg-muted text-xs text-muted-foreground transition-colors hover:bg-muted/70 active:scale-[0.98] disabled:opacity-50"
                  >
                    <CameraIcon className="size-5" aria-hidden />
                    添加照片
                  </button>
                </StaggerItem>
              ) : null}
            </StaggerList>

            {phase === "uploading" ? (
              <p className="text-sm text-muted-foreground" role="status">
                {uploadNote || "正在上传照片…"}
              </p>
            ) : null}

            <TapScale>
              <Button
                type="button"
                size="lg"
                className="h-12 w-full text-base"
                disabled={!canLeavePhotoStep}
                onClick={handlePhotoNext}
              >
                下一步
              </Button>
            </TapScale>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-heading text-base font-semibold">确认信息</h2>
              <p className="text-xs text-muted-foreground">
                AI 写的，可以直接改
              </p>
            </div>

            {analyzeState === "error" ? (
              <FadeIn className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-3 py-2">
                <p className="text-sm">识别失败，自己填一下</p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={retryAnalyze}
                >
                  识别物品
                </Button>
              </FadeIn>
            ) : null}

            {/*
              加载期间不渲染表单：骨架屏与输入框同时出现会出现两套输入框（第 2 轮 bug）。
              等待态交给全屏 LoadingOverlay，识别结束（成功或失败）再渲染填好的表单。
            */}
            {analyzeState === "running" ? null : (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="title">物品名称</Label>
                  <Input
                    id="title"
                    value={title}
                    maxLength={60}
                    placeholder="例如：黑色皮质钱包"
                    onChange={(event) => {
                      editedRef.current.title = true
                      setTitle(event.target.value)
                    }}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="description">物品描述</Label>
                  <Textarea
                    id="description"
                    value={description}
                    maxLength={600}
                    placeholder="例如：黑色长方形钱包，表面有一处贴纸，里面有几张卡"
                    onChange={(event) => {
                      editedRef.current.description = true
                      setDescription(event.target.value)
                    }}
                  />
                </div>
              </>
            )}

            <div className="mt-auto pt-2">
              <TapScale>
                <Button
                  type="button"
                  size="lg"
                  className="h-12 w-full text-base"
                  disabled={!canLeaveInfoStep}
                  onClick={() => goTo(2)}
                >
                  下一步
                </Button>
              </TapScale>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="my-auto flex min-w-0 flex-col gap-3">
            <h2 className="font-heading text-base font-semibold">怎么还</h2>

            <button
              type="button"
              data-testid="custody-kept"
              disabled={busy}
              onClick={() => pickCustody("kept")}
              className="flex flex-col gap-1 rounded-2xl bg-muted/60 px-4 py-3 text-left transition-colors hover:bg-muted active:scale-[0.99] disabled:opacity-60"
            >
              <span className="text-sm font-medium">代为保管</span>
              <span className="text-xs text-muted-foreground">
                我先收着，失主联系我，当面取回
              </span>
            </button>

            <button
              type="button"
              data-testid="custody-in-place"
              disabled={busy}
              onClick={() => pickCustody("in_place")}
              className="flex flex-col gap-1 rounded-2xl bg-muted/60 px-4 py-3 text-left transition-colors hover:bg-muted active:scale-[0.99] disabled:opacity-60"
            >
              <span className="text-sm font-medium">指定存放位置</span>
              <span className="text-xs text-muted-foreground">
                东西放在某处，失主自己去取
              </span>
            </button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="my-auto flex min-w-0 flex-col gap-5">
            {custody === "kept" ? (
              <div className="flex flex-col gap-2">
                <h2 className="font-heading text-base font-semibold">
                  联系方式
                </h2>
                <p className="text-xs text-muted-foreground">
                  用你账号里的手机号，失主会直接打给你
                </p>
                <PhoneText phone={contact} className="text-base" />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <h2 className="font-heading text-base font-semibold">
                  存放位置
                </h2>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  disabled={locating || busy}
                  onClick={locate}
                >
                  {locating ? "正在定位…" : "使用当前位置"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {coords
                    ? `已获取坐标：${coords.lat}, ${coords.lng}`
                    : "未获取到坐标，请填写位置描述"}
                </p>
                <Input
                  id="locationLabel"
                  value={locationLabel}
                  maxLength={200}
                  placeholder="例如：图书馆 3 楼自习区靠窗第三排"
                  onChange={(event) => setLocationLabel(event.target.value)}
                />
              </div>
            )}

            <TapScale>
              <Button
                type="button"
                size="lg"
                className="h-12 w-full text-base"
                disabled={busy}
                onClick={handlePublish}
              >
                {phase === "publishing" ? "正在发布…" : "发布"}
              </Button>
            </TapScale>
          </div>
        ) : null}
      </StepTransition>

      <LoadingOverlay
        show={checking}
        message="AI 正在看照片…"
        testId="photo-check-loading"
      />

      <LoadingOverlay
        show={analyzeState === "running"}
        message="AI 正在写描述…"
        testId="analyze-loading"
      />

      {/* 建议补拍：只是建议，用户可以「仍然继续」 */}
      <Dialog
        open={retakeReason !== null}
        onOpenChange={(open) => {
          if (!open) setRetakeReason(null)
        }}
      >
        <DialogContent
          data-testid="photo-advice-dialog"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>建议补拍</DialogTitle>
            <DialogDescription>{retakeReason ?? ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              data-testid="photo-advice-retake"
              onClick={() => setRetakeReason(null)}
            >
              继续拍照
            </Button>
            <Button
              type="button"
              data-testid="photo-advice-skip"
              onClick={() => {
                setRetakeReason(null)
                goTo(1)
              }}
            >
              仍然继续
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SuccessOverlay
        show={published}
        message="发布成功"
        testId="publish-success"
      />
    </div>
  )
}
