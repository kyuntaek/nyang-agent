export type NyanBtiArchetype = {
  code: string;
  nickname: string;
  emoji: string;
  headline: string;
  subline: string;
};

/** 2^4 = 16 유형 (독/애 × 활/여 × 직/은 × 민/무) */
export const NYAN_BTI_ARCHETYPES: Record<string, NyanBtiArchetype> = {
  독활직민: {
    code: '독활직민',
    nickname: '바람냥',
    emoji: '🌪',
    headline: '쿨한 모험가',
    subline: '집사는 내 배경화면',
  },
  독활직무: {
    code: '독활직무',
    nickname: '탐험대장냥',
    emoji: '🧭',
    headline: '겁 없는 탐험가',
    subline: '두려움이 없는 개척자',
  },
  독활은민: {
    code: '독활은민',
    nickname: '셜록냥',
    emoji: '🔍',
    headline: '신비로운 탐정',
    subline: '다 보고 있지만 말 안 함',
  },
  독활은무: {
    code: '독활은무',
    nickname: '자유냥',
    emoji: '🌈',
    headline: '자유로운 영혼',
    subline: '나는 나의 규칙대로',
  },
  독여직민: {
    code: '독여직민',
    nickname: '황제냥',
    emoji: '👑',
    headline: '까다로운 황제',
    subline: '모든 것은 내 기준에 맞아야 해',
  },
  독여직무: {
    code: '독여직무',
    nickname: '귀족냥',
    emoji: '🎩',
    headline: '여유로운 귀족',
    subline: '나는 원하는 것만 원한다',
  },
  독여은민: {
    code: '독여은민',
    nickname: '철학자냥',
    emoji: '🔭',
    headline: '관찰하는 철학자',
    subline: '창밖 세계가 나의 생각 거리',
  },
  독여은무: {
    code: '독여은무',
    nickname: '고요냥',
    emoji: '🌙',
    headline: '말없는 관찰자',
    subline: '움직이기엔 아직 이르다',
  },
  애활직민: {
    code: '애활직민',
    nickname: '직진냥',
    emoji: '💘',
    headline: '애정 폭격 직진',
    subline: '좋으면 바로 옆자리부터',
  },
  애활직무: {
    code: '애활직무',
    nickname: '썬샤인냥',
    emoji: '☀️',
    headline: '에너지 뿜뿜 친화력',
    subline: '오늘의 기분은 무지개',
  },
  애활은민: {
    code: '애활은민',
    nickname: '눈맞춤냥',
    emoji: '👁',
    headline: '말이 적어도 하트는 풀충전',
    subline: '눈빛은 이미 고백했다',
  },
  애활은무: {
    code: '애활은무',
    nickname: '트렌디냥',
    emoji: '✨',
    headline: '느긋한 케미 담당',
    subline: '무드만 챙기면 장면도 완성',
  },
  애여직민: {
    code: '애여직민',
    nickname: '집사심쿵냥',
    emoji: '🏡',
    headline: '애교 담당 실무파',
    subline: '집안 일과 나는 한 팀',
  },
  애여직무: {
    code: '애여직무',
    nickname: '품격냥',
    emoji: '🎀',
    headline: '단정한 미소 담당',
    subline: '나만의 리듬으로 우아하게',
  },
  애여은민: {
    code: '애여은민',
    nickname: '달빛냥',
    emoji: '🌕',
    headline: '포근한 속마음파',
    subline: '곁에 머무는 게 나의 언어',
  },
  애여은무: {
    code: '애여은무',
    nickname: '쿠션냥',
    emoji: '🛋',
    headline: '평온한 소파 종속',
    subline: '세상은 시끄럽고 나는 냥품',
  },
};

export function getNyanBtiArchetype(code: string): NyanBtiArchetype | null {
  if (!code || code.length !== 4) return null;
  return NYAN_BTI_ARCHETYPES[code] ?? null;
}
