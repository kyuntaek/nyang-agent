import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { markAgentScreenVisited } from '../../lib/agent-home-ui-flag';
import {
  formatAgentQuestion,
  getAgentTimeContext,
  resolveQuickParamToLabel,
} from '../../lib/agent-time-context';
import {
  useAgentChatHydrated,
  useAgentChatStore,
  type AgentChatMessage,
} from '../../lib/stores/agent-chat-store';
import { TabScreenHeaderRow } from '../../components/TabScreenHeaderRow';
import { COMMUNITY_PRIMARY, communityScreenPaddingTop } from '../../lib/community-tab-styles';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#7F77DD';
const AGENT_BUBBLE = '#EEEDFE';

type ApiMessage = { role: 'user' | 'assistant'; content: string };

type ChatMessage = AgentChatMessage;

function firstParam(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? (v[0] ?? '') : v;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function openingMessageId(catId: string): string {
  return `agent-opening-${catId}`;
}

/** 첫 메시지 본문 — API 없이 코드에서만 (한국 시간대별 질문) */
function openingMessageContent(catName: string): string {
  return formatAgentQuestion(getAgentTimeContext(), catName);
}

/** LLM이 쓰는 대괄호·호환 문자 → ASCII (NFKC + 전각·【】·〈〉 등) */
function normalizeChoiceBrackets(raw: string): string {
  return String(raw ?? '')
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    .replace(/&lbrack;/gi, '[')
    .replace(/&rbrack;/gi, ']')
    .normalize('NFKC')
    .replace(/\uFEFF/g, '')
    .replace(/\u200b/g, '')
    .replace(/\uFF3B/g, '[') // ［
    .replace(/\uFF3D/g, ']') // ］
    .replace(/\u3010/g, '[') // 【
    .replace(/\u3011/g, ']') // 】
    .replace(/\u3008/g, '[') // 〈
    .replace(/\u3009/g, ']') // 〉
    .replace(/〔/g, '[')
    .replace(/〕/g, ']')
    .replace(/\u27e8/g, '[') // ⟨
    .replace(/\u27e9/g, ']'); // ⟩
}

/** 모델이 파이프로만 적은 마지막 줄 (프롬프트 위배지만 흔함) */
function extractTailPipeChips(full: string): string[] | null {
  const lines = full.trimEnd().split(/\r?\n/);
  const last = lines[lines.length - 1]?.trim() ?? '';
  if (!/[|｜]/.test(last)) return null;
  const parts = last.split(/[|｜]/).map((p) => p.replace(/^[・·\s]+|[・·\s]+$/g, '').trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 8) return null;
  if (!parts.every((p) => p.length <= 28)) return null;
  return parts;
}

/** 끝에서부터 `- 항목` / `* 항목` / `• 항목` 연속 블록 */
function extractBulletTailChips(full: string): { chips: string[]; keepLineCount: number } | null {
  const lines = full.replace(/\r\n/g, '\n').split('\n');
  let i = lines.length - 1;
  const chips: string[] = [];
  while (i >= 0) {
    const raw = lines[i] ?? '';
    const line = raw.trim();
    if (line.length === 0) {
      i -= 1;
      continue;
    }
    const m = /^[-*•]\s*(.+)$/.exec(line);
    if (!m) break;
    const t = m[1].trim();
    if (t.length === 0 || t.length > 36) break;
    chips.unshift(t);
    i -= 1;
  }
  if (chips.length < 2 || chips.length > 8) return null;
  return { chips, keepLineCount: i + 1 };
}

/** `「…」` 연속(일본식 따옴표 선택지) */
function extractCornerQuoteChips(full: string): string[] | null {
  const re = /「([^」\r\n]{1,40})」/g;
  const out: string[] = [];
  for (const m of full.matchAll(re)) {
    const t = m[1].trim();
    if (t.length > 0) out.push(t);
  }
  return out.length >= 2 ? out : null;
}

/**
 * 정규화 후 ASCII `[` … `]` 쌍만 문자 단위로 처리 (Hermes/유니코드 플래그 이슈 회피).
 * 안쪽에 `[`/`]`/줄바꿈 없으면 선택지로 간주해 제거·칩 수집.
 */
function stripAsciiBracketChoices(norm: string): { text: string; chips: string[] } {
  const chips: string[] = [];
  let out = '';
  let i = 0;
  while (i < norm.length) {
    if (norm[i] === '[') {
      const j = norm.indexOf(']', i + 1);
      if (j === -1) {
        out += norm[i];
        i += 1;
        continue;
      }
      const inner = norm.slice(i + 1, j);
      const flat = inner.replace(/[\r\n]+/g, ' ').trim();
      if (
        flat.length > 0 &&
        flat.length <= 72 &&
        !flat.includes('[') &&
        !flat.includes(']')
      ) {
        chips.push(flat.replace(/\s+/g, ' ').trim());
        i = j + 1;
        continue;
      }
    }
    out += norm[i];
    i += 1;
  }
  return { text: out.replace(/\s{2,}/g, ' ').trim(), chips };
}

/** 말풍선 본문에서 `[…]`·`「…」` 제거 + 칩 추출 */
function parseAssistantMessageForUI(raw: string): { displayText: string; chips: string[] } {
  const s = normalizeChoiceBrackets(raw);
  let { text: displayText, chips } = stripAsciiBracketChoices(s);
  if (chips.length === 0) {
    const re = /\[\s*([^\]\r\n]{1,72}?)\s*\]/g;
    let m: RegExpExecArray | null;
    const re2 = new RegExp(re.source, re.flags);
    while ((m = re2.exec(s)) !== null) {
      const t = m[1].replace(/\s+/g, ' ').trim();
      if (t.length > 0) chips.push(t);
    }
    displayText = s.replace(/\[\s*[^\]\r\n]{0,72}?\s*\]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    for (let k = 0; k < 12; k += 1) {
      const next = displayText.replace(/\[\s*[^\]\r\n]{0,72}?\s*\]/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if (next === displayText) break;
      displayText = next;
    }
  }
  if (chips.length === 0) {
    const corner = extractCornerQuoteChips(s);
    if (corner != null) {
      chips.push(...corner);
      displayText = s.replace(/「[^」\r\n]{1,40}」/g, ' ').replace(/\s{2,}/g, ' ').trim();
      for (let i = 0; i < 8; i += 1) {
        const next = displayText.replace(/\[\s*[^\]\r\n]{0,72}?\s*\]/g, ' ').replace(/\s{2,}/g, ' ').trim();
        if (next === displayText) break;
        displayText = next;
      }
    }
  }
  if (chips.length === 0) {
    const pipeChips = extractTailPipeChips(s);
    if (pipeChips != null) {
      chips.push(...pipeChips);
      const dl = displayText.split(/\r?\n/);
      const lastDl = dl[dl.length - 1]?.trim() ?? '';
      if (dl.length > 0 && /[|｜]/.test(lastDl)) {
        displayText = dl.slice(0, -1).join('\n').replace(/\s{2,}/g, ' ').trim();
      }
    }
  }
  if (chips.length === 0) {
    const bullet = extractBulletTailChips(s);
    if (bullet != null) {
      chips.push(...bullet.chips);
      const sl = s.replace(/\r\n/g, '\n').split('\n');
      const kept = sl.slice(0, bullet.keepLineCount).join('\n');
      displayText = kept.replace(/\[\s*[^\]\r\n]{0,72}?\s*\]/g, ' ').replace(/\s{2,}/g, ' ').trim();
      for (let i = 0; i < 8; i += 1) {
        const next = displayText.replace(/\[\s*[^\]\r\n]{0,72}?\s*\]/g, ' ').replace(/\s{2,}/g, ' ').trim();
        if (next === displayText) break;
        displayText = next;
      }
    }
  }
  // 본문에 남은 `[…]` 한 번 더 제거(파이프/불릿 처리 후 잔여)
  const again = stripAsciiBracketChoices(displayText);
  displayText = again.text;
  for (const c of again.chips) {
    if (!chips.includes(c)) chips.push(c);
  }
  // 닫는 ] 없이 끝나는 `[...` 잔여 제거
  displayText = displayText.replace(/\s*\[[^\]\n\r]*$/g, '').trim();
  return { displayText, chips };
}

/** API에서 받은 어시스턴트 한 통 — content는 원문 유지, UI 필드는 수신 시 1회 계산 */
function createAssistantMessageFromApi(content: string): ChatMessage {
  const parsed = parseAssistantMessageForUI(content);
  return {
    id: newId(),
    role: 'assistant',
    content,
    uiBody: parsed.displayText,
    choiceLabels: parsed.chips.length > 0 ? parsed.chips : undefined,
  };
}

function buildOpeningMessage(catId: string, catName: string): ChatMessage {
  const content = openingMessageContent(catName);
  return {
    id: openingMessageId(catId),
    role: 'assistant',
    content,
    uiBody: content,
    choiceLabels: [...getAgentTimeContext().chips],
  };
}

/** divider 제외 가장 마지막 말풍선 (재진입·인사말 규칙용) */
function lastNonDividerMessage(messages: ChatMessage[]): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m && m.role !== 'divider') return m;
  }
  return undefined;
}

/** divider는 API에 넘기지 않음. 첫 말풍선(로컬 고정 assistant)은 히스토리에서 제외 */
function toApiHistory(messages: ChatMessage[]): ApiMessage[] {
  const mapped: ApiMessage[] = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map(({ role, content }) => ({ role: role as 'user' | 'assistant', content }));
  if (mapped.length > 0 && mapped[0].role === 'assistant') {
    return mapped.slice(1);
  }
  return mapped;
}

type CatRow = { id: string; name: string };

type AgentChatResponseBody = { text?: string; error?: string };

function getAgentChatFunctionUrl(): string {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '') ?? '';
  if (!base) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL이 설정되어 있지 않아요.');
  }
  return `${base}/functions/v1/agent-chat`;
}

/** Edge `verify_jwt`용: 유저 액세스 토큰 우선, 없으면 anon JWT(같은 프로젝트)로 게이트 통과 — `Bearer undefined` 금지 */
async function resolveFunctionBearerJwt(anonKey: string): Promise<string> {
  const { data: first } = await supabase.auth.getSession();
  let token = first.session?.access_token;
  if (!token) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    token = refreshed.session?.access_token;
  }
  return token ?? anonKey;
}

async function invokeAgentChat(
  catId: string,
  message: string,
  conversationHistory: ApiMessage[],
  options?: { reEntry?: boolean }
): Promise<string> {
  const url = getAgentChatFunctionUrl();
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY가 설정되어 있지 않아요.');
  }

  const bearerJwt = await resolveFunctionBearerJwt(anonKey);

  const payload: Record<string, unknown> = {
    catId,
    conversationHistory,
  };
  if (options?.reEntry) {
    payload.reEntry = true;
    payload.message = ' ';
  } else {
    payload.message = message;
  }

  let res: Response;
  let rawBody: string;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerJwt}`,
        apikey: anonKey,
      },
      body: JSON.stringify(payload),
    });
    rawBody = await res.text();
  } catch (err) {
    console.log('[agent-chat] fetch failed (network or abort)', {
      url,
      request: { catId, messageLength: message.length, conversationHistoryLength: conversationHistory.length },
      error: err,
    });
    throw err instanceof Error ? err : new Error(String(err));
  }

  let data: AgentChatResponseBody | null = null;
  try {
    data = rawBody ? (JSON.parse(rawBody) as AgentChatResponseBody) : null;
  } catch (parseErr) {
    console.log('[agent-chat] response is not JSON', {
      url,
      status: res.status,
      statusText: res.statusText,
      rawBody,
      parseError: parseErr,
    });
    throw new Error('에이전트 응답을 해석하지 못했어요.');
  }

  if (!res.ok) {
    const msg =
      data && typeof data.error === 'string'
        ? data.error
        : `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  if (data && typeof data.error === 'string' && data.error) {
    throw new Error(data.error);
  }

  const reply = typeof data?.text === 'string' ? data.text : '';
  if (!reply) {
    throw new Error('응답이 비어 있어요.');
  }

  return reply;
}

/**
 * 저장 스레드 → 화면용 스레드.
 * 재진입 시 **마지막 말풍선이 에이전트(assistant)** 이면 새 인사말(첫 말풍선 시간대 갱신)을 넣지 않음.
 */
function normalizeStoredThread(catId: string, catName: string, stored: ChatMessage[]): ChatMessage[] {
  const opening = buildOpeningMessage(catId, catName);
  if (stored.length === 0) return [opening];

  const lastSig = lastNonDividerMessage(stored);
  if (lastSig?.role === 'assistant') {
    return [...stored];
  }

  const next = [...stored];
  const first = next[0];
  if (first?.role === 'assistant') {
    /** 이전 답의 uiBody/choiceLabels가 오프닝에 남지 않도록 통째로 교체 */
    next[0] = { ...opening };
    return next;
  }
  return [opening, ...next];
}

function AgentScreenInner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ quick?: string | string[] }>();
  const quickParam = firstParam(params.quick);

  useFocusEffect(
    useCallback(() => {
      markAgentScreenVisited();
    }, [])
  );

  const [cat, setCat] = useState<CatRow | null>(null);
  const [catLoading, setCatLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const mmkvReady = useAgentChatHydrated();
  const catId = cat?.id;
  const storedThread = useAgentChatStore((s) => (catId ? s.byCatId[catId] : undefined));

  useEffect(() => {
    if (__DEV__) {
      console.log('[agent-screen] mmkvReady changed', { mmkvReady, catId: catId ?? null });
    }
  }, [mmkvReady, catId]);

  useEffect(() => {
    if (__DEV__) {
      console.log('[agent-screen] storedThread changed', {
        catId: catId ?? null,
        length: storedThread?.length ?? 0,
        roles: (storedThread ?? []).map((m) => m.role),
      });
    }
  }, [catId, storedThread]);

  const messages: ChatMessage[] = useMemo(() => {
    if (!cat || catLoading) return [];
    const raw = storedThread ?? [];
    return normalizeStoredThread(cat.id, cat.name ?? '', raw);
  }, [cat, catLoading, storedThread]);

  const visibleMessages: ChatMessage[] = useMemo(() => {
    if (!cat || catLoading) return [];
    if (messages.length > 0) return messages;
    return [buildOpeningMessage(cat.id, cat.name ?? '')];
  }, [cat, catLoading, messages]);

  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = visibleMessages;
  }, [visibleMessages]);

  const sendingRef = useRef(false);
  sendingRef.current = sending;

  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const reEntryInFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCatLoading(true);
      try {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData.user) {
          if (!cancelled) setCat(null);
          return;
        }
        const { data, error } = await supabase
          .from('cats')
          .select('id, name')
          .eq('user_id', userData.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setCat(data as CatRow | null);
      } catch {
        if (!cancelled) setCat(null);
      } finally {
        if (!cancelled) setCatLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** AsyncStorage 병합 이후: 빈 스레드만 오프닝 시드(하이드레이션보다 앞서 덮어쓰지 않도록 지연) */
  useEffect(() => {
    if (!catId || !mmkvReady || catLoading) return;
    const t = setTimeout(() => {
      if (!useAgentChatStore.persist.hasHydrated()) return;
      const row = useAgentChatStore.getState().byCatId[catId];
      if (row != null && row.length > 0) return;
      useAgentChatStore.getState().setByCatId(catId, [buildOpeningMessage(catId, cat?.name ?? '')]);
    }, 400);
    return () => clearTimeout(t);
  }, [catId, cat?.name, mmkvReady, catLoading]);

  /** 홈에서 quick만 전달 — 입력창에만 넣고, 전송 시에만 API (`q0`~`q2` 또는 레거시 ate_well 등) */
  useEffect(() => {
    if (!cat || !quickParam) return;
    const label = resolveQuickParamToLabel(quickParam, getAgentTimeContext());
    if (!label) return;
    setInput(label);
    router.setParams({ quick: undefined });
  }, [cat?.id, quickParam, router]);

  /** 재진입: MMKV 복원이 늦어도 잡히도록 짧게 재시도 후 API (탭 포커스마다) */
  const runReEntryAssistant = useCallback(
    async (catId: string, thread: ChatMessage[], shouldAbort?: () => boolean) => {
      if (reEntryInFlightRef.current) return;
      if (!thread.some((m) => m.role === 'user')) return;
      /** 대화가 에이전트 말로 끝난 상태면 재진입 API 인사·추가 말풍선 없음 */
      if (lastNonDividerMessage(thread)?.role === 'assistant') return;
      const hist = toApiHistory(thread);
      if (hist.length === 0) return;

      reEntryInFlightRef.current = true;
      setSending(true);

      try {
        const text = await invokeAgentChat(catId, '', hist, { reEntry: true });
        if (shouldAbort?.()) return;
        useAgentChatStore.getState().updateByCatId(catId, (prev) => [...prev, createAssistantMessageFromApi(text)]);
      } catch (e) {
        if (shouldAbort?.()) return;
        const msg = e instanceof Error ? e.message : '알 수 없는 오류';
        useAgentChatStore.getState().updateByCatId(catId, (prev) => [
          ...prev,
          createAssistantMessageFromApi(`잠시 문제가 생겼어요. (${msg})`),
        ]);
      } finally {
        setSending(false);
        reEntryInFlightRef.current = false;
      }
    },
    []
  );

  /** 탭 포커스 시 재진입 어시스턴트(스레드는 zustand+MMKV 단일 소스) */
  useFocusEffect(
    useCallback(() => {
      if (!catId || catLoading) return undefined;
      let cancelled = false;

      void (async () => {
        for (let attempt = 0; attempt < 50; attempt += 1) {
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, 100));
          if (sendingRef.current || reEntryInFlightRef.current) continue;
          const thread = messagesRef.current;
          if (!thread.some((m) => m.role === 'user')) continue;
          await runReEntryAssistant(catId, thread, () => cancelled);
          return;
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [catId, catLoading, runReEntryAssistant])
  );

  const sendToAgent = useCallback(async (userText: string) => {
    const trimmed = userText.trim();
    if (!trimmed || sending) return;

    const catId = cat?.id;
    if (!catId || !cat) return;

    const openingMsg = buildOpeningMessage(catId, cat.name ?? '');
    const prev = messagesRef.current;
    const withOpening: ChatMessage[] =
      prev.length === 0
        ? [openingMsg]
        : prev[0]?.id === openingMsg.id && prev[0]?.role === 'assistant'
          ? [openingMsg, ...prev.slice(1)]
          : prev[0]?.role === 'assistant'
            ? [openingMsg, ...prev.slice(1)]
            : [openingMsg, ...prev];

    const userMsg: ChatMessage = { id: newId(), role: 'user', content: trimmed };
    const nextThread = [...withOpening, userMsg];
    const historyForApi = toApiHistory(nextThread);

    useAgentChatStore.getState().setByCatId(catId, nextThread);
    setInput('');
    setSending(true);

    try {
      const reply = await invokeAgentChat(catId, trimmed, historyForApi);
      useAgentChatStore.getState().updateByCatId(catId, (p) => [...p, createAssistantMessageFromApi(reply)]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류';
      useAgentChatStore.getState().updateByCatId(catId, (p) => [
        ...p,
        createAssistantMessageFromApi(`잠시 문제가 생겼어요. (${msg})`),
      ]);
    } finally {
      setSending(false);
    }
  }, [cat, sending]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, sending]);

  const onSubmit = () => {
    void sendToAgent(input);
  };

  /**
   * 입력 위 답변 칩: 아래에서 위로 스캔해 파싱된 선택지가 있는 **가장 최근** 어시스턴트 답을 사용,
   * 없으면 홈과 동일한 예시 칩.
   */
  const agentChoiceChips = useMemo(() => {
    for (let i = visibleMessages.length - 1; i >= 0; i -= 1) {
      const m = visibleMessages[i];
      if (m.role !== 'assistant') continue;
      const fromSaved = (m.choiceLabels ?? []).map((s) => s.trim()).filter(Boolean);
      if (fromSaved.length > 0) return fromSaved;
      const { chips } = parseAssistantMessageForUI(m.uiBody ?? m.content);
      if (chips.length > 0) return chips;
    }
    return [...getAgentTimeContext().chips];
  }, [visibleMessages]);

  /** 대화기록삭제: 저장 스레드에서 가장 최근 2개 말풍선만 남김 */
  const onTrimAgentHistory = useCallback(() => {
    if (!catId) return;
    useAgentChatStore.getState().updateByCatId(catId, (prev) => prev.slice(-2));
  }, [catId]);

  return (
    <View className="flex-1 bg-violet-50" style={{ flex: 1, minHeight: 0 }}>
      <View className="flex-1" style={{ flex: 1, minHeight: 0, paddingTop: communityScreenPaddingTop(insets.top) }}>
        <View className="px-4 pb-2">
          <TabScreenHeaderRow
            title="에이전트"
            right={
              catId ? (
                <TouchableOpacity
                  onPress={onTrimAgentHistory}
                  hitSlop={8}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel="대화 기록 삭제, 최근 두 개만 남김"
                >
                  <Text className="text-xs font-semibold" style={{ color: COMMUNITY_PRIMARY }} numberOfLines={1}>
                    대화기록삭제
                  </Text>
                </TouchableOpacity>
              ) : null
            }
          />
        </View>

        {catLoading && (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator size="large" color={PRIMARY} />
          </View>
        )}

        {!catLoading && cat == null && (
          <View className="flex-1 justify-center px-6">
            <Text className="text-center text-lg font-semibold text-violet-950">
              등록된 냥이가 없어요
            </Text>
            <Text className="mt-2 text-center text-base leading-6 text-violet-700">
              프로필을 먼저 등록하면 에이전트와 대화할 수 있어요.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/profile-setup')}
              activeOpacity={0.9}
              style={{ backgroundColor: PRIMARY }}
              className="mt-6 items-center rounded-2xl py-4"
            >
              <Text className="text-base font-bold text-white">냥이 프로필 등록하기</Text>
            </TouchableOpacity>
          </View>
        )}

        {!catLoading && cat != null && (
          <>
            <View className="min-h-0 flex-1 px-4">
              <ScrollView
                ref={scrollRef}
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                contentContainerStyle={{
                  paddingTop: 8,
                  paddingBottom: 12,
                }}
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              >
                <View className="w-full">
                  {!mmkvReady ? (
                    <View className="items-center py-16">
                      <ActivityIndicator size="small" color={PRIMARY} />
                    </View>
                  ) : null}
                  {visibleMessages.map((m) => {
                    if (m.role === 'divider') {
                      return (
                        <View key={m.id} className="mb-3 mt-2 w-full items-center px-2">
                          <Text className="text-center text-sm font-medium text-violet-400">
                            {m.content}
                          </Text>
                        </View>
                      );
                    }
                    const isUser = m.role === 'user';
                    const bubbleText = isUser
                      ? m.content
                      : parseAssistantMessageForUI(m.uiBody ?? m.content).displayText;
                    return (
                      <View
                        key={m.id}
                        className={`mb-2 w-full flex-row ${isUser ? 'justify-end' : 'justify-start'}`}
                      >
                        <View
                          className={`max-w-[88%] rounded-2xl px-4 py-3 ${isUser ? 'rounded-br-md' : 'rounded-bl-md'}`}
                          style={{
                            backgroundColor: isUser ? PRIMARY : AGENT_BUBBLE,
                          }}
                        >
                          <Text
                            className={`text-base leading-6 ${isUser ? 'text-white' : 'text-violet-950'}`}
                          >
                            {bubbleText}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                  {sending && (
                    <View className="mb-2 w-full flex-row justify-start">
                      <View className="max-w-[88%] rounded-2xl rounded-bl-md bg-[#EEEDFE] px-4 py-3">
                        <ActivityIndicator color={PRIMARY} size="small" />
                      </View>
                    </View>
                  )}
                </View>
              </ScrollView>
            </View>

            <View
              className="border-t border-violet-200 bg-violet-100 px-4 pt-2"
              style={{
                paddingBottom: Math.max(insets.bottom, 8),
                flexShrink: 0,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  marginBottom: 10,
                  minHeight: 44,
                }}
              >
                {(agentChoiceChips.length > 0 ? agentChoiceChips : [...getAgentTimeContext().chips]).map(
                  (label, idx) => (
                    <TouchableOpacity
                      key={`agent-chip-${idx}-${label}`}
                      onPress={() => void sendToAgent(label)}
                      disabled={sending}
                      activeOpacity={0.85}
                      style={{
                        backgroundColor: '#EEEDFE',
                        marginRight: 8,
                        marginBottom: 6,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 9999,
                        opacity: sending ? 0.45 : 1,
                      }}
                    >
                      <Text className="text-sm font-semibold" style={{ color: '#7F77DD' }}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
              <View className="flex-row items-center gap-2">
                <TextInput
                  ref={inputRef}
                  value={input}
                  onChangeText={setInput}
                  placeholder="메시지를 입력해 주세요"
                  placeholderTextColor="#8b7fd8"
                  editable={!sending}
                  multiline
                  maxLength={2000}
                  className="max-h-28 min-h-12 flex-1 rounded-2xl border-2 border-violet-300 bg-violet-50 px-4 py-3 text-base text-violet-950"
                  style={{
                    opacity: sending ? 0.55 : 1,
                    ...(Platform.OS === 'android' ? { textAlignVertical: 'center' as const } : {}),
                  }}
                />
                <TouchableOpacity
                  onPress={onSubmit}
                  disabled={sending || !input.trim()}
                  activeOpacity={0.9}
                  style={{ backgroundColor: PRIMARY }}
                  className={`rounded-2xl px-5 py-3 ${sending || !input.trim() ? 'opacity-45' : ''}`}
                >
                  {sending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text className="text-base font-bold text-white">전송</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

export default function AgentScreen() {
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-violet-50"
      style={{ flex: 1, minHeight: 0 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <AgentScreenInner />
    </KeyboardAvoidingView>
  );
}
