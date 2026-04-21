import { createMMKV } from 'react-native-mmkv';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type AgentChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'divider';
  /** API 재전송용 원문(선택지 포함) */
  content: string;
  /** 말풍선 표시용 — 없으면 content에서 파싱 */
  uiBody?: string;
  /** 입력 위 칩 — 없으면 content에서 파싱 */
  choiceLabels?: string[];
};

const storage = createMMKV({ id: 'agent-chat-store' });

const mmkvStorage = {
  getItem: (name: string): string | null => {
    const value = storage.getString(name) ?? null;
    if (__DEV__) {
      console.log('[agent-chat-store] getItem', {
        key: name,
        valueLength: value?.length ?? 0,
      });
    }
    return value;
  },
  setItem: (name: string, value: string): void => {
    storage.set(name, value);
  },
  removeItem: (name: string): void => {
    storage.remove(name);
  },
};

type AgentChatState = {
  byCatId: Record<string, AgentChatMessage[]>;
  setByCatId: (catId: string, messages: AgentChatMessage[]) => void;
  updateByCatId: (catId: string, updater: (prev: AgentChatMessage[]) => AgentChatMessage[]) => void;
  clearByCatId: (catId: string) => void;
};

export const useAgentChatStore = create<AgentChatState>()(
  persist(
    (set) => ({
      byCatId: {},
      setByCatId: (catId, messages) =>
        set((s) => ({
          byCatId: { ...s.byCatId, [catId]: messages },
        })),
      updateByCatId: (catId, updater) =>
        set((s) => {
          const prev = s.byCatId[catId] ?? [];
          const next = updater(prev);
          return { byCatId: { ...s.byCatId, [catId]: next } };
        }),
      clearByCatId: (catId) =>
        set((s) => {
          const next = { ...s.byCatId };
          delete next[catId];
          return { byCatId: next };
        }),
    }),
    {
      name: 'agent-chat-store',
      version: 1,
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (s) => ({ byCatId: s.byCatId }),
    }
  )
);

export function waitForAgentChatHydration(): Promise<void> {
  return new Promise((resolve) => {
    if (useAgentChatStore.persist.hasHydrated()) {
      resolve();
      return;
    }
    const unsub = useAgentChatStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

export function useAgentChatHydrated(): boolean {
  const [ok, setOk] = useState(() => useAgentChatStore.persist.hasHydrated());
  useEffect(() => {
    if (ok) return undefined;
    const unsubStart = useAgentChatStore.persist.onHydrate(() => {
      if (__DEV__) console.log('[agent-chat-store] onHydrate start');
    });
    const unsubFinish = useAgentChatStore.persist.onFinishHydration(() => {
      if (__DEV__) console.log('[agent-chat-store] onFinishHydration');
      setOk(true);
    });
    const poll = setInterval(() => {
      if (useAgentChatStore.persist.hasHydrated()) {
        if (__DEV__) console.log('[agent-chat-store] hasHydrated=true (poll)');
        setOk(true);
      }
    }, 200);
    const t = setTimeout(() => {
      if (__DEV__) {
        console.log('[agent-chat-store] hydration timeout fallback');
      }
      setOk(true);
    }, 2000);
    return () => {
      unsubStart();
      unsubFinish();
      clearInterval(poll);
      clearTimeout(t);
    };
  }, [ok]);
  return ok;
}
