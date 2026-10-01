export function pointsForDiscountPercent(discountPercent) {
  if (!Number.isInteger(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
    return 0;
  }

  if (discountPercent <= 40) return Math.ceil(discountPercent / 10) * 500;
  if (discountPercent <= 50) return 3000;
  return 3000 + Math.ceil((discountPercent - 50) / 10) * 1000;
}