const addCalendarMonths = (value, months) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date;
};

export const getPromoQuotaCycle = (payment, now = new Date()) => {
  const durationMonths = Number(payment?.promo_duration_months);
  const paymentDate = new Date(payment?.payment_date);
  const currentDate = new Date(now);

  if (
    !Number.isSafeInteger(durationMonths) ||
    durationMonths <= 0 ||
    Number.isNaN(paymentDate.getTime()) ||
    Number.isNaN(currentDate.getTime())
  ) {
    return null;
  }

  const calculatedExpiry = addCalendarMonths(paymentDate, durationMonths);
  const recordedExpiry = payment?.expires_at ? new Date(payment.expires_at) : calculatedExpiry;
  if (!calculatedExpiry || Number.isNaN(recordedExpiry.getTime())) return null;

  const subscriptionEnd = recordedExpiry < calculatedExpiry ? recordedExpiry : calculatedExpiry;
  if (currentDate < paymentDate || currentDate >= subscriptionEnd) return null;

  let cycleNumber = 1;
  while (cycleNumber < durationMonths && currentDate >= addCalendarMonths(paymentDate, cycleNumber)) {
    cycleNumber += 1;
  }

  const cycleStart = addCalendarMonths(paymentDate, cycleNumber - 1);
  const nextCycleStart = addCalendarMonths(paymentDate, cycleNumber);
  const cycleEnd = cycleNumber < durationMonths && nextCycleStart < subscriptionEnd
    ? nextCycleStart
    : subscriptionEnd;

  return {
    cycleNumber,
    durationMonths,
    startsAt: cycleStart.toISOString(),
    endsAt: cycleEnd.toISOString(),
    renewsAt: cycleNumber < durationMonths ? cycleEnd.toISOString() : null,
  };
};
