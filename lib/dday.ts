/** YYYY-MM-DD → 로컬 자정 기준 Date */
export function parseLocalYmd(iso: string): Date {
  const [y, m, d] = iso.split('-').map((x) => Number(x));
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** 매년 반복: 올해 해당 월일이 오늘 이전이면 내년. 오늘과의 일 수 차이(내림). */
export function daysUntilNextYearly(ymd: string): number {
  const ref = startOfDay(parseLocalYmd(ymd));
  const month = ref.getMonth();
  const day = ref.getDate();
  const today = startOfDay(new Date());
  let next = new Date(today.getFullYear(), month, day);
  if (next < today) {
    next = new Date(today.getFullYear() + 1, month, day);
  }
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

/** 일회성: 이벤트일 − 오늘(일 단위). */
export function daysUntilOneShot(ymd: string): number {
  const event = startOfDay(parseLocalYmd(ymd));
  const today = startOfDay(new Date());
  return Math.round((event.getTime() - today.getTime()) / 86400000);
}

export function anniversaryCountdownLabel(ymd: string, repeatYearly: boolean): string {
  const d = repeatYearly ? daysUntilNextYearly(ymd) : daysUntilOneShot(ymd);
  if (d === 0) return 'D-Day';
  if (d > 0) return `D-${d}`;
  return `지남 (D+${Math.abs(d)})`;
}
