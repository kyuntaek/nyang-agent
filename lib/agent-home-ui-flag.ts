/**
 * 홈 에이전트 카드: 최초에는 답변 칩, 에이전트 화면을 본 뒤에는 CTA 버튼으로 전환할 때 사용.
 * 모듈 플래그 + 홈 `useFocusEffect`에서 동기화해 리렌더합니다.
 */
let visitedAgentScreen = false;

export function markAgentScreenVisited(): void {
  visitedAgentScreen = true;
}

export function getAgentScreenVisited(): boolean {
  return visitedAgentScreen;
}
