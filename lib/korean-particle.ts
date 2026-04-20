/** 한글 음절 마지막 받침 유무 → 이어 붙일 조사 '와' / '과' */
export function waGwa(name: string): '와' | '과' {
  if (!name) return '와';
  const last = name[name.length - 1]!;
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return '와';
  const jong = (code - 0xac00) % 28;
  return jong === 0 ? '와' : '과';
}
