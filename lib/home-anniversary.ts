import type { AnniversaryRow } from './cat-life-queries';
import { anniversaryCountdownLabel, daysUntilNextYearly, daysUntilOneShot } from './dday';
import type { LatestCatRow } from './fetch-latest-cat';

export type HomeAnniversaryHighlight = {
  title: string;
  /** 예: D-Day, D-7일, 지남 (D+3) */
  countdownLabel: string;
};

type Candidate = { title: string; ymd: string; repeatYearly: boolean; d: number };

function collectAnniversaryCandidates(cat: LatestCatRow, rows: AnniversaryRow[]): Candidate[] {
  const cands: Candidate[] = [];
  if (cat.birth_date) {
    const ymd = cat.birth_date.slice(0, 10);
    cands.push({ title: '생일', ymd, repeatYearly: true, d: daysUntilNextYearly(ymd) });
  }
  if (cat.adopted_at) {
    const ymd = cat.adopted_at.slice(0, 10);
    cands.push({ title: '입양일', ymd, repeatYearly: true, d: daysUntilNextYearly(ymd) });
  }
  for (const r of rows) {
    const ymd = r.date.slice(0, 10);
    cands.push({
      title: r.title.trim() || '기념일',
      ymd,
      repeatYearly: r.repeat_yearly,
      d: r.repeat_yearly ? daysUntilNextYearly(ymd) : daysUntilOneShot(ymd),
    });
  }
  return cands;
}

/** D-7 → D-7일 (요청 표기). D-Day·지남 문구는 그대로 */
function formatCountdownLabelForHome(raw: string): string {
  if (raw === 'D-Day') return 'D-Day';
  const m = /^D-(\d+)$/.exec(raw);
  if (m) return `D-${m[1]}일`;
  return raw;
}

/**
 * 홈 기념일 한 줄: 다가오는 일정 중 **가장 가까운** 날(동률이면 제목 순).
 * 일회성이 전부 지난 경우에는, 그중 **가장 최근에 지난**(d가 가장 큼) 항목을 사용.
 */
export function pickSoonestAnniversaryHighlight(
  cat: LatestCatRow,
  rows: AnniversaryRow[],
): HomeAnniversaryHighlight | null {
  const cands = collectAnniversaryCandidates(cat, rows);
  if (cands.length === 0) return null;

  const upcoming = cands.filter((c) => c.d >= 0);
  let pick: Candidate;
  if (upcoming.length > 0) {
    pick = [...upcoming].sort((a, b) => a.d - b.d || a.title.localeCompare(b.title))[0];
  } else {
    pick = [...cands].sort((a, b) => b.d - a.d || a.title.localeCompare(b.title))[0];
  }

  const raw = anniversaryCountdownLabel(pick.ymd, pick.repeatYearly);
  return {
    title: pick.title,
    countdownLabel: formatCountdownLabelForHome(raw),
  };
}
