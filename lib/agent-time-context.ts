/**
 * 냥 에이전트 오프닝·칩·백엔드 프롬프트용 시간대 (한국 시간 기준).
 */

export type AgentTimeSlot = 'morning' | 'day' | 'evening' | 'night';

export type AgentTimeContext = {
  slot: AgentTimeSlot;
  /** 시스템 프롬프트용 한글 */
  slotLabelKr: string;
  /** `{이름}` 치환 */
  questionTemplate: string;
  chips: readonly [string, string, string];
};

export type AgentQuestionTemplates = {
  morningQuestion?: string;
  afternoonQuestion?: string;
  eveningQuestion?: string;
  nightQuestion?: string;
};

function koreaHour(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const raw = parts.find((p) => p.type === 'hour')?.value;
  const h = parseInt(raw ?? '0', 10);
  return Number.isFinite(h) ? h : 0;
}

/**
 * 현재(기본: 한국 시) 시간대별 질문 템플릿·칩 3개.
 * - 06:00 ~ 11:00 미만: 아침
 * - 11:00 ~ 17:00 미만: 낮
 * - 17:00 ~ 21:00 미만: 저녁
 * - 그 외: 야간 (21:00 ~ 다음날 06:00)
 */
export function getAgentTimeContext(at: Date = new Date(), templates?: AgentQuestionTemplates): AgentTimeContext {
  const h = koreaHour(at);
  if (h >= 6 && h < 11) {
    return {
      slot: 'morning',
      slotLabelKr: '아침',
      questionTemplate: templates?.morningQuestion?.trim() || '{이름} 오늘 아침밥은요? 🍚',
      chips: ['잘 먹었어요', '조금 남겼어요', '아직요'],
    };
  }
  if (h >= 11 && h < 17) {
    return {
      slot: 'day',
      slotLabelKr: '낮',
      questionTemplate: templates?.afternoonQuestion?.trim() || '{이름} 오늘 간식 먹었어요? 🐟',
      chips: ['먹었어요', '아직요', '안 줬어요'],
    };
  }
  if (h >= 17 && h < 21) {
    return {
      slot: 'evening',
      slotLabelKr: '저녁',
      questionTemplate: templates?.eveningQuestion?.trim() || '{이름} 저녁밥 시간이에요! 🍖',
      chips: ['잘 먹었어요', '조금 남겼어요', '아직요'],
    };
  }
  return {
    slot: 'night',
    slotLabelKr: '야간',
    questionTemplate: templates?.nightQuestion?.trim() || '{이름} 자기 전 야식은요? 🌙',
    chips: ['줬어요', '참았어요', '조금만 줬어요'],
  };
}

/** `{이름}` → 표시 이름(빈 값이면 `냥이`) */
export function formatAgentQuestion(ctx: AgentTimeContext, name: string): string {
  const n = name.trim() || '냥이';
  return ctx.questionTemplate.replace(/\{이름\}/g, n);
}

/** 홈 `?quick=` 구버전: 인덱스 0..2 */
export const LEGACY_QUICK_PARAM_TO_INDEX: Record<string, 0 | 1 | 2> = {
  ate_well: 0,
  ate_little: 1,
  not_yet: 2,
};

/** `q0` | `q1` | `q2` 또는 레거시 키 → 현재 시간대 칩 문구 */
export function resolveQuickParamToLabel(quickParam: string, ctx: AgentTimeContext): string | null {
  const trimmed = quickParam.trim();
  const legacy = LEGACY_QUICK_PARAM_TO_INDEX[trimmed];
  if (legacy !== undefined) return ctx.chips[legacy] ?? null;
  const m = /^q([012])$/.exec(trimmed);
  if (m) {
    const i = Number(m[1]) as 0 | 1 | 2;
    return ctx.chips[i] ?? null;
  }
  return null;
}
