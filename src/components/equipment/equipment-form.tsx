"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useApp } from "@/lib/store"
import { cleanPhone, uid } from "@/lib/helpers"
import type { PaymentTerms } from "@/lib/types"

export function EquipmentForm() {
  const router = useRouter()
  const { addEquipment, clients, findClientByPhone } = useApp()

  const [title, setTitle] = useState("")
  const [contactName, setContactName] = useState("")
  const [phone, setPhone] = useState("")
  const [amount, setAmount] = useState("")
  const [terms, setTerms] = useState<PaymentTerms>("immediate")
  const [notes, setNotes] = useState("")
  const [clientId, setClientId] = useState<string>("")

  const submit = () => {
    if (!title.trim()) return toast.error("יש להזין תיאור עסקה")
    if (!phone.trim()) return toast.error("יש להזין טלפון")

    const cleaned = cleanPhone(phone)
    const existing = clientId || findClientByPhone(cleaned)?.id || uid("client")

    addEquipment({
      id: uid("eq"),
      clientId: existing,
      title: title.trim(),
      status: "inquiry",
      amount: Number(amount) || 0,
      paymentTerms: terms,
      contactName: contactName.trim(),
      phone: cleaned,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    toast.success("העסקה נוצרה")
    router.push("/equipment")
  }

  return (
    <div>
      <PageHeader
        title="עסקת ציוד חדשה"
        back={
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowRight className="size-5" />
          </Button>
        }
      />

      <div className="space-y-4 p-4">
        <div className="space-y-1.5">
          <Label>תיאור העסקה *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: ערכות עזרה ראשונה x20" />
        </div>

        {clients.length > 0 && (
          <div className="space-y-1.5">
            <Label>שיוך ללקוח קיים (לא חובה)</Label>
            <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="בחר לקוח" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>איש קשר</Label>
          <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="שם איש קשר" />
        </div>

        <div className="space-y-1.5">
          <Label>טלפון *</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="050-0000000" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>סכום (₪)</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>תנאי תשלום</Label>
            <Select value={terms} onValueChange={(v) => setTerms(v as PaymentTerms)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="immediate">מיידי</SelectItem>
                <SelectItem value="net30">שוטף + 30</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>הערות</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="פרטים נוספים על העסקה" />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[76px] z-30 mx-auto max-w-md px-4 md:inset-x-auto md:bottom-6 md:start-[calc(14rem+1.5rem)] md:max-w-sm">
        <Button className="h-12 w-full text-base shadow-lg" onClick={submit}>
          צור עסקה
        </Button>
      </div>
    </div>
  )
}
