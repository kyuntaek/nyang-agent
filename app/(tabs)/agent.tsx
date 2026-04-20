import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { supabase } from '../../lib/supabase';

const PRIMARY = '#7F77DD';
const AGENT_BUBBLE = '#EEEDFE';

const QUICK_CHIPS = [
  { key: 'ate_well', label: '잘 먹었어요' },
  { key: 'ate_little', label: '조금 남겼어요' },
  { key: 'not_yet', label: '아직요' },
] as const;

type ApiMessage = { role: 'user' | 'assistant'; content: string };

type ChatMessage = ApiMessage & { id: string };

function firstParam(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? (v[0] ?? '') : v;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** 첫 말풍선은 로컬 안내용(assistant)일 수 있어, API에는 user로 시작하는 구간만 넘깁니다. */
function toApiHistory(messages: ChatMessage[]): ApiMessage[] {
  const mapped: ApiMessage[] = messages.map(({ role, content }) => ({ role, content }));
  if (mapped.length > 0 && mapped[0].role === 'assistant') {
    return mapped.slice(1);
  }
  return mapped;
}

type CatRow = { id: string; name: string };

type AgentChatResponseBody = { text?: string; error?: string };

/**
 * Supabase Edge Functions URL:
 * `EXPO_PUBLIC_SUPABASE_URL`이 `https://{project_ref}.supabase.co`일 때
 * → `https://{project_ref}.supabase.co/functions/v1/agent-chat`
 */
function getAgentChatFunctionUrl(): string {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '') ?? '';
  if (!base) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL이 설정되어 있지 않아요.');
  }
  return `${base}/functions/v1/agent-chat`;
}

async function invokeAgentChat(
  catId: string,
  message: string,
  conversationHistory: ApiMessage[]
): Promise<string> {
  const url = getAgentChatFunctionUrl();
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY가 설정되어 있지 않아요.');
  }

  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  const payload = { catId, message, conversationHistory };

  let res: Response;
  let rawBody: string;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
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
    console.log('[agent-chat] HTTP error (full)', {
      url,
      method: 'POST',
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      requestBody: payload,
      responseBody: data ?? rawBody,
    });
    const msg =
      data && typeof data.error === 'string'
        ? data.error
        : `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  if (data && typeof data.error === 'string' && data.error) {
    console.log('[agent-chat] error field in 2xx body (full)', {
      url,
      status: res.status,
      requestBody: payload,
      responseBody: data,
    });
    throw new Error(data.error);
  }

  const reply = typeof data?.text === 'string' ? data.text : '';
  if (!reply) {
    console.log('[agent-chat] missing text in success body (full)', {
      url,
      status: res.status,
      requestBody: payload,
      responseBody: data,
      rawBody,
    });
    throw new Error('응답이 비어 있어요.');
  }

  return reply;
}

function AgentScreenInner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ quick?: string | string[] }>();
  const quickParam = firstParam(params.quick);

  const [cat, setCat] = useState<CatRow | null>(null);
  const [catLoading, setCatLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const bootstrappedCatId = useRef<string | null>(null);

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

  const sendToAgent = useCallback(async (userText: string) => {
    const trimmed = userText.trim();
    if (!trimmed || sending) return;

    const catId = cat?.id;
    if (!catId) return;

    const historyForApi = toApiHistory(messagesRef.current);

    const userMsg: ChatMessage = { id: newId(), role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const reply = await invokeAgentChat(catId, trimmed, historyForApi);
      setMessages((prev) => [...prev, { id: newId(), role: 'assistant', content: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류';
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'assistant', content: `잠시 문제가 생겼어요. (${msg})` },
      ]);
    } finally {
      setSending(false);
    }
  }, [cat?.id, sending]);

  useEffect(() => {
    if (catLoading || cat == null) return;
    if (bootstrappedCatId.current === cat.id) return;
    bootstrappedCatId.current = cat.id;

    const name = cat.name?.trim() || '냥이';
    const opening = `${name} 오늘 어때요? 🐱`;
    const openingMsg: ChatMessage = { id: newId(), role: 'assistant', content: opening };

    const label = QUICK_CHIPS.find((c) => c.key === quickParam)?.label;
    if (!label) {
      setMessages([openingMsg]);
      return;
    }

    const userMsg: ChatMessage = { id: newId(), role: 'user', content: label };
    setMessages([openingMsg, userMsg]);
    setSending(true);

    void (async () => {
      try {
        const reply = await invokeAgentChat(cat.id, label, []);
        setMessages((prev) => [...prev, { id: newId(), role: 'assistant', content: reply }]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '알 수 없는 오류';
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: 'assistant', content: `잠시 문제가 생겼어요. (${msg})` },
        ]);
      } finally {
        setSending(false);
      }
    })();
  }, [catLoading, cat, quickParam]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, sending]);

  const onSubmit = () => {
    void sendToAgent(input);
  };

  const exit = () => {
    router.push('/');
  };

  return (
    <View className="flex-1 bg-violet-50" style={{ flex: 1, minHeight: 0 }}>
      <View className="flex-1" style={{ flex: 1, minHeight: 0, paddingTop: insets.top + 8 }}>
        <View className="flex-row items-center justify-between px-4 pb-2">
          <TouchableOpacity onPress={exit} hitSlop={12} activeOpacity={0.75} className="py-2">
            <Text className="text-base font-semibold text-[#7F77DD]">← 홈</Text>
          </TouchableOpacity>
          <Text className="text-base font-bold text-violet-950">에이전트</Text>
          <View className="w-14" />
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
                  /** 입력창은 ScrollView 밖 형제 — 키보드 높이 패딩 금지 (scrollToEnd가 빈 영역으로 가며 말풍선이 사라짐) */
                  paddingBottom: 12,
                }}
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              >
                <View className="w-full">
                  {messages.map((m) => {
                    const isUser = m.role === 'user';
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
                            {m.content}
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
              style={{ paddingBottom: Math.max(insets.bottom, 8) }}
            >
              <View className="mb-2 flex-row flex-wrap gap-2">
                {QUICK_CHIPS.map((c) => (
                  <TouchableOpacity
                    key={c.key}
                    onPress={() => void sendToAgent(c.label)}
                    disabled={sending}
                    activeOpacity={0.85}
                    className={`rounded-full border-2 border-violet-300 bg-violet-50 px-3 py-2 ${
                      sending ? 'opacity-45' : ''
                    }`}
                  >
                    <Text className="text-sm font-semibold text-violet-950">{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View className="flex-row items-end gap-2">
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
                  style={{ opacity: sending ? 0.55 : 1 }}
                />
                <TouchableOpacity
                  onPress={onSubmit}
                  disabled={sending || !input.trim()}
                  activeOpacity={0.9}
                  style={{ backgroundColor: PRIMARY }}
                  className={`mb-0.5 rounded-2xl px-5 py-3 ${sending || !input.trim() ? 'opacity-45' : ''}`}
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

/**
 * `SmartKeyboardScreen`은 탭+고정 입력에서 루트 패딩과 스크롤 `keyboardInset`이 겹치며
 * `scrollToEnd`가 빈 패딩으로 스크롤되어 말풍선이 사라질 수 있음. 탭은 `_layout`에서 키보드 시 숨김.
 */
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
