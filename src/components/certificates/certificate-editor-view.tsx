"use client"

import Link from "next/link"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  ArrowRight,
  Bold,
  ImagePlus,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  Type,
  Upload,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getCertificateTemplateAction,
  previewCertificatePdfAction,
  saveCertificateTemplateAction,
  searchTraineesForCertificatePreviewAction,
  setCertificateBackgroundAction,
  uploadCertificateAssetAction,
  resetCertificateTemplateAction,
} from "@/lib/certificate-template-actions"
import {
  CERTIFICATE_FIELD_KEYS,
  CERTIFICATE_FIELD_LABELS,
  SAMPLE_PREVIEW_FIELDS,
  newImageElementDraft,
  newTextElementDraft,
  type CertificateElement,
  type CertificateFieldKey,
  type CertificatePreviewFields,
  type CertificateTemplate,
  type CertificateTextElement,
} from "@/lib/certificate-template"
import { cn } from "@/lib/utils"

type TraineeHit = {
  id: string
  fullName: string
  idNumber: string
  phone?: string
  source: "trainee" | "participant"
  preview: CertificatePreviewFields
}

function downloadPdfBase64(base64: string, fileName: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export function CertificateEditorView() {
  const [template, setTemplate] = useState<CertificateTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [selectedId, setSelectedId] = useState<string>("")
  const [previewFields, setPreviewFields] =
    useState<CertificatePreviewFields>(SAMPLE_PREVIEW_FIELDS)
  const [previewLabel, setPreviewLabel] = useState("דמה")
  const [traineeQuery, setTraineeQuery] = useState("")
  const [traineeHits, setTraineeHits] = useState<TraineeHit[]>([])
  const [searchingTrainees, setSearchingTrainees] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [canvasWidth, setCanvasWidth] = useState(520)
  const dragRef = useRef<{
    id: string
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)

  useLayoutEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const update = () => setCanvasWidth(el.getBoundingClientRect().width || 520)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [template])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getCertificateTemplateAction()
    setLoading(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setTemplate(res.data)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const selected = useMemo(
    () => template?.elements.find((el) => el.id === selectedId) || null,
    [template, selectedId],
  )

  const updateElement = (id: string, patch: Partial<CertificateElement>) => {
    setTemplate((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        elements: prev.elements.map((el) =>
          el.id === id ? ({ ...el, ...patch } as CertificateElement) : el,
        ),
      }
    })
  }

  const removeElement = (id: string) => {
    setTemplate((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        elements: prev.elements.filter((el) => el.id !== id),
      }
    })
    if (selectedId === id) setSelectedId("")
  }

  const addTextField = (field: CertificateFieldKey) => {
    const el = newTextElementDraft(field)
    setTemplate((prev) =>
      prev ? { ...prev, elements: [...prev.elements, el] } : prev,
    )
    setSelectedId(el.id)
  }

  const onUploadBackground = async (file: File | null) => {
    if (!file || !template) return
    const fd = new FormData()
    fd.set("file", file)
    const res = await setCertificateBackgroundAction(fd)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setTemplate(res.data)
    toast.success("רקע התעודה עודכן")
  }

  const onUploadLogo = async (file: File | null) => {
    if (!file || !template) return
    const fd = new FormData()
    fd.set("file", file)
    const res = await uploadCertificateAssetAction(fd)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    const el = newImageElementDraft(res.data.url)
    setTemplate({
      ...template,
      elements: [...template.elements, el],
    })
    setSelectedId(el.id)
    toast.success("הלוגו נוסף לתבנית")
  }

  const onSave = async () => {
    if (!template) return
    setSaving(true)
    const res = await saveCertificateTemplateAction(template)
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setTemplate(res.data)
    toast.success("התבנית נשמרה")
  }

  const onReset = async () => {
    if (!confirm("לאפס את התבנית לברירת המחדל?")) return
    const res = await resetCertificateTemplateAction()
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setTemplate(res.data)
    setSelectedId("")
    toast.success("התבנית אופסה")
  }

  const onPreviewPdf = async () => {
    if (!template) return
    setPreviewing(true)
    const res = await previewCertificatePdfAction({
      template,
      fields: previewFields,
    })
    setPreviewing(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    downloadPdfBase64(res.data.pdfBase64, res.data.fileName)
    toast.success("PDF הורד לתצוגה")
  }

  const searchTrainees = async () => {
    setSearchingTrainees(true)
    const res = await searchTraineesForCertificatePreviewAction(traineeQuery)
    setSearchingTrainees(false)
    if (!res.ok) {
      toast.error(res.error)
      setTraineeHits([])
      return
    }
    setTraineeHits(res.data)
    if (!res.data.length) toast.error("לא נמצאו מודרכים")
  }

  const pickTrainee = (hit: TraineeHit) => {
    setPreviewFields(hit.preview)
    setPreviewLabel(hit.fullName)
    setTraineeHits([])
    setTraineeQuery(hit.fullName)
    toast.success(`תצוגה עם ${hit.fullName}`)
  }

  const onPointerDownElement = (
    event: React.PointerEvent,
    el: CertificateElement,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedId(el.id)
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = {
      id: el.id,
      startX: event.clientX,
      startY: event.clientY,
      origX: el.xPct,
      origY: el.yPct,
    }
    ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!drag || !rect || !template) return
    const dxPct = ((event.clientX - drag.startX) / rect.width) * 100
    const dyPct = ((event.clientY - drag.startY) / rect.height) * 100
    // RTL canvas: visual x increases leftward in screen? Actually LTR DOM: x increases to the right.
    // Hebrew page is RTL for text but positions are absolute LTR percentages from left.
    updateElement(drag.id, {
      xPct: Math.min(98, Math.max(2, drag.origX + dxPct)),
      yPct: Math.min(98, Math.max(2, drag.origY + dyPct)),
    })
  }

  const onPointerUp = () => {
    dragRef.current = null
  }

  if (loading || !template) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        טוען עורך תעודה…
      </div>
    )
  }

  return (
    <div className="pb-24 md:pb-8">
      <PageHeader
        title="עריכת תעודה"
        subtitle="מיקום שדות, לוגו ורקע — עם תצוגה לפי מודרך"
        back={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            nativeButton={false}
            className="size-9 rounded-xl"
            render={
              <Link href="/certificates" aria-label="חזרה לניהול תעודות">
                <ArrowRight className="size-5" />
              </Link>
            }
          />
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => void onReset()}
            >
              איפוס
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={previewing}
              onClick={() => void onPreviewPdf()}
            >
              {previewing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              הורדת PDF
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-xl"
              disabled={saving}
              onClick={() => void onSave()}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              שמירה
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 p-4 md:grid-cols-[320px_minmax(0,1fr)] md:p-6">
        <aside className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <div>
            <Label className="mb-1.5 block text-xs">שם התבנית</Label>
            <Input
              value={template.name}
              onChange={(e) =>
                setTemplate({ ...template, name: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">רקע ולוגו</p>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-sm hover:bg-muted/60">
              <Upload className="size-4" />
              העלאת רקע תעודה
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) =>
                  void onUploadBackground(e.target.files?.[0] || null)
                }
              />
            </label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-sm hover:bg-muted/60">
              <ImagePlus className="size-4" />
              הוספת לוגו / תמונה
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => void onUploadLogo(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">הוספת שדה</p>
            <div className="flex flex-wrap gap-1.5">
              {CERTIFICATE_FIELD_KEYS.map((field) => (
                <Button
                  key={field}
                  type="button"
                  size="xs"
                  variant="secondary"
                  className="rounded-lg"
                  onClick={() => addTextField(field)}
                >
                  <Plus className="size-3" />
                  {CERTIFICATE_FIELD_LABELS[field]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <UserRound className="size-4" />
              תצוגה עם מודרך
            </p>
            <p className="text-xs text-muted-foreground">
              כרגע: <strong>{previewLabel}</strong>
            </p>
            <div className="flex gap-2">
              <Input
                value={traineeQuery}
                onChange={(e) => setTraineeQuery(e.target.value)}
                placeholder="חיפוש שם / ת״ז / טלפון"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void searchTrainees()
                  }
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="shrink-0 rounded-xl"
                disabled={searchingTrainees}
                onClick={() => void searchTrainees()}
              >
                {searchingTrainees ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
              </Button>
            </div>
            {traineeHits.length ? (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
                {traineeHits.map((hit) => (
                  <li key={`${hit.source}-${hit.id}`}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-2 py-1.5 text-right text-sm hover:bg-muted"
                      onClick={() => pickTrainee(hit)}
                    >
                      <span className="block font-medium">{hit.fullName}</span>
                      <span className="text-xs text-muted-foreground">
                        {hit.idNumber || "ללא ת״ז"}
                        {hit.phone ? ` · ${hit.phone}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full rounded-xl"
              onClick={() => {
                setPreviewFields(SAMPLE_PREVIEW_FIELDS)
                setPreviewLabel("דמה")
              }}
            >
              חזרה לנתוני דמה
            </Button>
          </div>

          {selected?.kind === "text" ? (
            <TextElementControls
              element={selected}
              onChange={(patch) => updateElement(selected.id, patch)}
              onRemove={() => removeElement(selected.id)}
            />
          ) : null}

          {selected?.kind === "image" ? (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-sm font-semibold">עריכת תמונה</p>
              <Label className="text-xs">רוחב %</Label>
              <Input
                type="number"
                value={selected.widthPct}
                onChange={(e) =>
                  updateElement(selected.id, {
                    widthPct: Number(e.target.value) || 10,
                  })
                }
              />
              <Label className="text-xs">גובה %</Label>
              <Input
                type="number"
                value={selected.heightPct}
                onChange={(e) =>
                  updateElement(selected.id, {
                    heightPct: Number(e.target.value) || 10,
                  })
                }
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="w-full rounded-xl"
                onClick={() => removeElement(selected.id)}
              >
                <Trash2 className="size-4" />
                מחיקת תמונה
              </Button>
            </div>
          ) : null}

          <div className="border-t border-border pt-3">
            <p className="mb-2 text-sm font-semibold">שכבות</p>
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {template.elements.map((el) => (
                <li key={el.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-right text-sm",
                      selectedId === el.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted",
                    )}
                    onClick={() => setSelectedId(el.id)}
                  >
                    {el.kind === "text" ? (
                      <Type className="size-3.5 shrink-0" />
                    ) : (
                      <ImagePlus className="size-3.5 shrink-0" />
                    )}
                    <span className="truncate">
                      {el.kind === "text"
                        ? CERTIFICATE_FIELD_LABELS[el.field]
                        : "תמונה"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="min-w-0">
          <p className="mb-2 text-sm text-muted-foreground">
            גררו שדות על התעודה. המיקומים נשמרים באחוזים ומשמשים גם בהפקת PDF.
          </p>
          <div
            ref={canvasRef}
            className="relative mx-auto aspect-[210/297] w-full max-w-[520px] overflow-hidden rounded-2xl border border-border bg-white shadow-sm select-none"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onClick={() => setSelectedId("")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={template.backgroundUrl}
              alt="רקע תעודה"
              className="pointer-events-none absolute inset-0 h-full w-full object-fill"
              draggable={false}
            />
            {template.elements.map((el) => {
              if (el.kind === "image") {
                return (
                  <div
                    key={el.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "absolute cursor-grab touch-none border border-transparent active:cursor-grabbing",
                      selectedId === el.id && "border-amber-500 border-dashed",
                    )}
                    style={{
                      left: `${el.xPct}%`,
                      top: `${el.yPct}%`,
                      width: `${el.widthPct}%`,
                      height: `${el.heightPct}%`,
                    }}
                    onPointerDown={(e) => onPointerDownElement(e, el)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={el.src}
                      alt=""
                      className="h-full w-full object-contain"
                      draggable={false}
                    />
                  </div>
                )
              }

              const text = resolvePreviewText(el, previewFields)
              return (
                <div
                  key={el.id}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "absolute cursor-grab touch-none border border-transparent px-0.5 active:cursor-grabbing",
                    selectedId === el.id &&
                      "rounded-md border-amber-500 border-dashed bg-amber-400/10",
                  )}
                  style={{
                    left: `${el.xPct}%`,
                    top: `${el.yPct}%`,
                    width: `${el.maxWidthPct}%`,
                    transform:
                      el.align === "center"
                        ? "translateX(-50%)"
                        : el.align === "right"
                          ? "translateX(-100%)"
                          : "none",
                  }}
                  onPointerDown={(e) => onPointerDownElement(e, el)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <AutoFitPreviewText
                    text={text || "—"}
                    maxFontSize={el.fontSize}
                    fontWeight={el.fontWeight}
                    align={el.align}
                    pageWidth={template.pageWidth}
                    canvasWidth={canvasWidth}
                  />
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

function resolvePreviewText(
  el: CertificateTextElement,
  fields: CertificatePreviewFields,
) {
  if (el.field === "custom") return el.customText || ""
  return fields[el.field] || ""
}

/**
 * מקטין את הפונט עד שהטקסט נכנס לרוחב השדה — בלי שלוש נקודות.
 * משקף את לוגיקת ה־Auto-fit בהפקת ה־PDF.
 */
function AutoFitPreviewText({
  text,
  maxFontSize,
  fontWeight,
  align,
  pageWidth,
  canvasWidth,
}: {
  text: string
  maxFontSize: number
  fontWeight: "regular" | "bold"
  align: "center" | "right" | "left"
  pageWidth: number
  canvasWidth: number
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const scale = pageWidth > 0 ? canvasWidth / pageWidth : 1
  const maxPx = Math.max(8, maxFontSize * scale)
  const minPx = Math.min(7 * scale, Math.max(5 * scale, maxPx * 0.35))
  const [fontSize, setFontSize] = useState(maxPx)

  useLayoutEffect(() => {
    const box = boxRef.current
    const span = textRef.current
    if (!box || !span) return

    let lo = minPx
    let hi = maxPx
    let best = minPx
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2
      span.style.fontSize = `${mid}px`
      if (span.scrollWidth <= box.clientWidth + 0.5) {
        best = mid
        lo = mid + 0.05
      } else {
        hi = mid - 0.05
      }
      if (lo > hi) break
    }
    setFontSize(best)
    span.style.fontSize = `${best}px`
  }, [text, maxPx, minPx, fontWeight, align, canvasWidth])

  return (
    <div
      ref={boxRef}
      className="w-full overflow-hidden"
      style={{ textAlign: align }}
    >
      <span
        ref={textRef}
        className="inline-block max-w-none whitespace-nowrap"
        style={{
          fontSize,
          fontWeight: fontWeight === "bold" ? 700 : 500,
          fontFamily: "Tahoma, Arial, sans-serif",
          color: "#1f2937",
          lineHeight: 1.2,
        }}
      >
        {text}
      </span>
    </div>
  )
}

function TextElementControls({
  element,
  onChange,
  onRemove,
}: {
  element: CertificateTextElement
  onChange: (patch: Partial<CertificateTextElement>) => void
  onRemove: () => void
}) {
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-sm font-semibold">עריכת שדה</p>
      <Label className="text-xs">סוג שדה</Label>
      <select
        className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
        value={element.field}
        onChange={(e) =>
          onChange({ field: e.target.value as CertificateFieldKey })
        }
      >
        {CERTIFICATE_FIELD_KEYS.map((field) => (
          <option key={field} value={field}>
            {CERTIFICATE_FIELD_LABELS[field]}
          </option>
        ))}
      </select>
      {element.field === "custom" ? (
        <>
          <Label className="text-xs">טקסט</Label>
          <Input
            value={element.customText || ""}
            onChange={(e) => onChange({ customText: e.target.value })}
          />
        </>
      ) : null}
      <Label className="text-xs">גודל גופן</Label>
      <Input
        type="number"
        value={element.fontSize}
        onChange={(e) =>
          onChange({ fontSize: Math.max(8, Number(e.target.value) || 14) })
        }
      />
      <Label className="text-xs">רוחב מקסימלי %</Label>
      <Input
        type="number"
        value={element.maxWidthPct}
        onChange={(e) =>
          onChange({ maxWidthPct: Math.max(10, Number(e.target.value) || 40) })
        }
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={element.fontWeight === "bold" ? "default" : "outline"}
          className="flex-1 rounded-xl"
          onClick={() =>
            onChange({
              fontWeight: element.fontWeight === "bold" ? "regular" : "bold",
            })
          }
        >
          <Bold className="size-4" />
          מודגש
        </Button>
        <select
          className="h-8 flex-1 rounded-lg border border-border bg-background px-2 text-sm"
          value={element.align}
          onChange={(e) =>
            onChange({
              align: e.target.value as CertificateTextElement["align"],
            })
          }
        >
          <option value="center">מרכז</option>
          <option value="right">ימין</option>
          <option value="left">שמאל</option>
        </select>
      </div>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="w-full rounded-xl"
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
        מחיקת שדה
      </Button>
    </div>
  )
}
