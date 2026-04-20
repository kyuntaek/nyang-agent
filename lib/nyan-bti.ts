export type BtiTag = '독' | '애' | '활' | '여' | '직' | '은' | '민' | '무';

export type BtiScores = Record<BtiTag, number>;

export const INITIAL_SCORES: BtiScores = {
  독: 0,
  애: 0,
  활: 0,
  여: 0,
  직: 0,
  은: 0,
  민: 0,
  무: 0,
};

export type BtiChoice = {
  label: string;
  tags: [BtiTag, BtiTag];
};

export type BtiQuestion = {
  prompt: string;
  choices: BtiChoice[];
};

export const NYAN_BTI_QUESTIONS: BtiQuestion[] = [
  {
    prompt: '집사가 퇴근하면?',
    choices: [
      { label: '현관까지 달려와요', tags: ['애', '활'] },
      { label: '멀리서 쳐다봐요', tags: ['애', '은'] },
      { label: '잠깐 눈 떠요', tags: ['독', '은'] },
      { label: '본체만체해요', tags: ['독', '직'] },
    ],
  },
  {
    prompt: '밥그릇이 비면?',
    choices: [
      { label: '바로 항의해요', tags: ['직', '민'] },
      { label: '그릇을 밀어요', tags: ['직', '무'] },
      { label: '눈으로 말해요', tags: ['은', '민'] },
      { label: '조용히 기다려요', tags: ['은', '무'] },
    ],
  },
  {
    prompt: '혼자 있을 때?',
    choices: [
      { label: '집안을 뛰어다녀요', tags: ['활', '독'] },
      { label: '창밖을 봐요', tags: ['여', '독'] },
      { label: '자요', tags: ['여', '무'] },
      { label: '장난감 놀아요', tags: ['활', '무'] },
    ],
  },
  {
    prompt: '낯선 사람이 오면?',
    choices: [
      { label: '먼저 다가가요', tags: ['애', '활'] },
      { label: '숨어요', tags: ['독', '민'] },
      { label: '멀리서 관찰해요', tags: ['독', '은'] },
      { label: '무관심해요', tags: ['독', '무'] },
    ],
  },
  {
    prompt: '집사가 슬퍼 보이면?',
    choices: [
      { label: '바로 옆에 와요', tags: ['애', '민'] },
      { label: '슬며시 옆에 앉아요', tags: ['애', '은'] },
      { label: '못 느껴요', tags: ['독', '무'] },
      { label: '느끼는데 모른 척해요', tags: ['독', '민'] },
    ],
  },
  {
    prompt: '좋아하는 놀이는?',
    choices: [
      { label: '집사랑 같이 노는 거요', tags: ['애', '활'] },
      { label: '혼자 사냥 놀이요', tags: ['독', '활'] },
      { label: '장난감보다 박스요', tags: ['여', '독'] },
      { label: '그냥 누워있는 게 놀이예요', tags: ['여', '무'] },
    ],
  },
  {
    prompt: '원하는 게 있을 때?',
    choices: [
      { label: '바로 울어요', tags: ['직', '민'] },
      { label: '발로 건드려요', tags: ['직', '무'] },
      { label: '물끄러미 봐요', tags: ['은', '민'] },
      { label: '알아서 주겠지 기다려요', tags: ['은', '무'] },
    ],
  },
  {
    prompt: '새 장난감이 생기면?',
    choices: [
      { label: '바로 달려들어요', tags: ['활', '민'] },
      { label: '일단 냄새 맡아요', tags: ['여', '민'] },
      { label: '나중에 관심 가져요', tags: ['여', '무'] },
      { label: '박스에 더 관심 있어요', tags: ['독', '무'] },
    ],
  },
];

/** 동점이면 각 축에서 앞쪽 글자(독·활·직·민)를 택함 */
export function computeNyanBtiCode(scores: BtiScores): string {
  const a1 = scores['독'] >= scores['애'] ? '독' : '애';
  const a2 = scores['활'] >= scores['여'] ? '활' : '여';
  const a3 = scores['직'] >= scores['은'] ? '직' : '은';
  const a4 = scores['민'] >= scores['무'] ? '민' : '무';
  return `${a1}${a2}${a3}${a4}`;
}

export function addChoiceScores(prev: BtiScores, tags: [BtiTag, BtiTag]): BtiScores {
  const next = { ...prev };
  next[tags[0]] += 1;
  next[tags[1]] += 1;
  return next;
}
