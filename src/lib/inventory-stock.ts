/** מלאי וירטואלי = הוכנס − נמכר */
export function currentStockOf(item: {
  totalPurchased?: number | null
  totalSold?: number | null
  isComposite?: boolean
}): number {
  if (item.isComposite) return 0
  return (Number(item.totalPurchased) || 0) - (Number(item.totalSold) || 0)
}
