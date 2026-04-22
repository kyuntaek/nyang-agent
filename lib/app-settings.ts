import { supabase } from './supabase';

export type MobileAppSettings = {
  appName: string;
  noticeBanner: string;
  maintenanceMode: boolean;
  agentName: string;
  agentGreeting: string;
  morningQuestion: string;
  afternoonQuestion: string;
  eveningQuestion: string;
  nightQuestion: string;
  challengeMaxPhotos: number;
  challengeMaxSizeMb: number;
};

const DEFAULT_SETTINGS: MobileAppSettings = {
  appName: '냥이 에이전트',
  noticeBanner: '',
  maintenanceMode: false,
  agentName: '냥이 에이전트',
  agentGreeting: '안녕하세요!',
  morningQuestion: '{이름} 오늘 아침밥은요? 🍚',
  afternoonQuestion: '{이름} 오늘 간식 먹었어요? 🐟',
  eveningQuestion: '{이름} 저녁밥 시간이에요! 🍖',
  nightQuestion: '{이름} 자기 전 야식은요? 🌙',
  challengeMaxPhotos: 1,
  challengeMaxSizeMb: 10,
};

function parsePositiveInt(value: string | null | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export async function fetchMobileAppSettings(): Promise<MobileAppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', [
      'app_name',
      'notice_banner',
      'maintenance_mode',
      'agent_name',
      'agent_greeting',
      'morning_question',
      'afternoon_question',
      'evening_question',
      'night_question',
      'challenge_max_photos',
      'challenge_max_size_mb',
    ]);

  if (error || !data) return DEFAULT_SETTINGS;

  const map = data.reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value ?? '';
    return acc;
  }, {});

  return {
    appName: map.app_name?.trim() || DEFAULT_SETTINGS.appName,
    noticeBanner: map.notice_banner?.trim() || DEFAULT_SETTINGS.noticeBanner,
    maintenanceMode: (map.maintenance_mode?.trim() || 'false').toLowerCase() === 'true',
    agentName: map.agent_name?.trim() || DEFAULT_SETTINGS.agentName,
    agentGreeting: map.agent_greeting?.trim() || DEFAULT_SETTINGS.agentGreeting,
    morningQuestion: map.morning_question?.trim() || DEFAULT_SETTINGS.morningQuestion,
    afternoonQuestion: map.afternoon_question?.trim() || DEFAULT_SETTINGS.afternoonQuestion,
    eveningQuestion: map.evening_question?.trim() || DEFAULT_SETTINGS.eveningQuestion,
    nightQuestion: map.night_question?.trim() || DEFAULT_SETTINGS.nightQuestion,
    challengeMaxPhotos: parsePositiveInt(map.challenge_max_photos, DEFAULT_SETTINGS.challengeMaxPhotos),
    challengeMaxSizeMb: parsePositiveInt(map.challenge_max_size_mb, DEFAULT_SETTINGS.challengeMaxSizeMb),
  };
}

