/**
 * 한국 로케일 날짜 표시 + iOS DateTimePicker locale.
 * DB·API는 계속 YYYY-MM-DD(toYmd)로 통일합니다.
 */

/** iOS UIDatePicker 전용 (ICU / Apple 식별자) */
export const IOS_DATE_PICKER_LOCALE = 'ko_KR';

export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 화면 표시: 예) 2025년 4월 18일 */
export function toLocaleDateLongKo(d: Date): string {
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
