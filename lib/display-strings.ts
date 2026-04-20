/** 사용자 닉네임: 5자 이상이면 앞 4자 + … */
export function truncateUserNickname(raw: string): string {
  const s = raw.trim();
  if (s.length < 5) return s;
  return `${s.slice(0, 4)}…`;
}

/** 냥이 이름: 8자 초과 시 8자 + … */
export function truncateCatName(raw: string): string {
  const s = raw.trim();
  if (s.length <= 8) return s;
  return `${s.slice(0, 8)}…`;
}
