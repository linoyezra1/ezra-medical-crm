"use client"

import { Landmark } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  BANK_ACCOUNTS,
  type BankAccountKey,
} from "@/lib/bank-accounts"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (account: BankAccountKey) => void
}

export function BankAccountPickerDialog({
  open,
  onOpenChange,
  onSelect,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader className="text-right">
          <DialogTitle>לאיזה חשבון להפיק את הפרטים?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {(Object.keys(BANK_ACCOUNTS) as BankAccountKey[]).map((key) => (
            <Button
              key={key}
              type="button"
              variant="outline"
              className="h-auto w-full justify-start gap-3 rounded-xl py-3.5 text-right"
              onClick={() => {
                onSelect(key)
                onOpenChange(false)
              }}
            >
              <Landmark className="size-5 shrink-0 text-primary" />
              <span className="font-semibold">{BANK_ACCOUNTS[key].label}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
