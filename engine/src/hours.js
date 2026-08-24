// Opening-hours evaluation against the `periods` array Google Places returns.
// This is what makes "open until 6" a fact rather than a caption.

/** periods: [{ open: {day,hour,minute}, close: {day,hour,minute} }], day 0 = Sunday. */
export function isOpenAt(periods, date) {
  if (!periods?.length) return null;             // unknown — caller decides
  if (periods.length === 1 && !periods[0].close) return true; // open 24/7

  const mins = date.getHours() * 60 + date.getMinutes();
  const day = date.getDay();

  for (const p of periods) {
    if (!p.open) continue;
    const openMin = p.open.hour * 60 + (p.open.minute || 0);
    if (!p.close) { if (p.open.day === day && mins >= openMin) return true; continue; }
    const closeMin = p.close.hour * 60 + (p.close.minute || 0);

    if (p.open.day === p.close.day) {
      if (p.open.day === day && mins >= openMin && mins < closeMin) return true;
    } else {
      // Spans midnight: open late on one day, closes early the next.
      if (p.open.day === day && mins >= openMin) return true;
      if (p.close.day === day && mins < closeMin) return true;
    }
  }
  return false;
}

export function closingSoon(periods, date, withinMin = 90) {
  if (!isOpenAt(periods, date)) return null;
  const mins = date.getHours() * 60 + date.getMinutes();
  const day = date.getDay();
  for (const p of periods) {
    if (!p.close) continue;
    const closeMin = p.close.hour * 60 + (p.close.minute || 0);
    const sameDay = p.close.day === day && closeMin > mins;
    if (sameDay && closeMin - mins <= withinMin) return closeMin - mins;
  }
  return null;
}

export const fmtTime = (h, m) => {
  const suffix = h >= 12 ? 'pm' : 'am';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hr}:${String(m).padStart(2, '0')}${suffix}` : `${hr}${suffix}`;
};

export function closesAt(periods, date) {
  if (!periods?.length) return null;
  const day = date.getDay();
  const mins = date.getHours() * 60 + date.getMinutes();
  for (const p of periods) {
    if (!p.close) continue;
    const closeMin = p.close.hour * 60 + (p.close.minute || 0);
    if (p.close.day === day && closeMin > mins) return fmtTime(p.close.hour, p.close.minute || 0);
  }
  return null;
}
