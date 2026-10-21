const philippinePesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
})

export function formatShopPrice(price: number | null): string {
  return price === null ? 'Rate unavailable' : philippinePesoFormatter.format(price)
}
