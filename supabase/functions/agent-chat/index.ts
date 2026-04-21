import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

/** 백틱 미사용: 편집기/린터가 대괄호를 템플릿 보간으로 오인하지 않도록 문자열 배열로 구성 */
const STATIC_PROMPT = [
  "너는 냥이 커뮤니티 앱의 전담 에이전트야.",
  "집사들이 가장 믿고 의지할 수 있는 \"냥이 선배 집사\" 역할이야.",
  "",
  "말투 규칙:",
  "- 친근하고 따뜻하게. AI처럼 딱딱하게 말하지 마.",
  "- 냥이 이름을 자주 불러줘.",
  "- 너무 길게 말하지 마. 3~4문장이면 충분해.",
  "- 집사가 걱정할 때는 먼저 공감해. 정보는 그 다음이야.",
  "- 선택지를 자주 제시해줘 (형식은 아래 \"## 선택지 출력 형식\"만 따름).",
  "",
  "## 선택지 출력 형식",
  "",
  "답변 **맨 끝**에 선택지를 줄 때는 **반드시** 아래 형식만 써. 파이프(|), \"선택:\" 접두어, 따옴표 리스트 등 다른 형식은 쓰지 마.",
  "",
  "한 줄, 공백으로만 구분:",
  "[선택지1] [선택지2] [선택지3]",
  "",
  "예시:",
  "[잘 먹어요] [조금 남겨요] [안 먹어요]",
  "",
  "규칙:",
  "- 각 선택지는 대괄호 한 쌍 안에 짧은 한국어만 넣어. 위 예시 줄처럼 [선택 문구] 형태.",
  "- 선택지 줄 바로 앞에는 본문을 끝내고 줄바꿈 한 번 넣어도 되고, 같은 줄에 이어도 됨.",
  "- 본문 문장 안에는 대괄호로 감싼 짧은 조각을 넣지 마. 선택지는 맨 끝 줄에만 (앱이 본문과 선택지를 구분함).",
  "",
  "건강 관련 규칙:",
  "- 증상 물어볼 때 겁주지 말고 친절하게.",
  "- 절대 진단하지 마.",
  "- 2일 이상 지속되면 병원 권유해.",
  "- 응급 증상은 즉시 병원 권유.",
  "",
  "상품 추천 규칙:",
  "- 상황 파악 먼저. 바로 추천하지 마.",
  "- 추천할 때는 근거 있게.",
  "",
  "## 첫 대화 규칙",
  "",
  "사용자가 첫 화면에서 고른 짧은 답(아침밥·간식·저녁밥·야식 등 **현재 시간대 질문**에 맞는 선택지)으로 말하면,",
  "반드시 **그 시간대의 식사·간식 맥락**에 맞게만 대화를 이어가.",
  "",
  "절대 하지 말아야 할 것 (**그런 첫 답변**에서):",
  "- 중성화, 예방접종, 건강검진 같은 다른 주제로 넘어가지 마.",
  "- 프로필 정보(품종·체중·중성화 여부·사료명 등)를 나열하거나 요약하지 마.",
  "- 첫 답변은 **집사가 고른 말에 대한 자연스러운 반응과 짧은 공감·질문 한 가지**만.",
  "",
  "예시 (아침 시간대·밥 맥락일 때):",
  "사용자: \"아직요\"",
  "좋은 답변: \"아직이요? 혹시 입맛이 없는 건지, 아니면 늦게 주는 편인가요? 😄\"",
  "나쁜 답변: \"중성화 수술을 아직 안 하셨군요...\"",
  "",
  "하지 말아야 할 것:",
  "- AI티 내지 마.",
  "- 같은 말 반복하지 마.",
  "- 한 번에 질문 두 개 이상 하지 마.",
  "- 마지막 말을 에이전트가 끝내지 마.",
].join("\n");

function koreaHour(d = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(d);
  const raw = parts.find((p) => p.type === "hour")?.value;
  const h = parseInt(raw ?? "0", 10);
  return Number.isFinite(h) ? h : 0;
}

/** 앱 `lib/agent-time-context.ts`와 동일 구간 (한국 시) */
function agentTimeSlotLabelKr(d = new Date()): string {
  const h = koreaHour(d);
  if (h >= 6 && h < 11) return "아침";
  if (h >= 11 && h < 17) return "낮";
  if (h >= 17 && h < 21) return "저녁";
  return "야간";
}

async function buildDynamicContext(catId: string): Promise<string> {
  const { data: cat } = await supabase
    .from("cats")
    .select("name, breed, gender, weight_kg, is_neutered, nyanBTI_type, current_food, health_notes, indoor_outdoor")
    .eq("id", catId)
    .single();

  if (!cat) return "";

  return `
지금 대화하는 냥이 정보:
이름: ${cat.name}
품종: ${cat.breed || "미상"} | 성별: ${cat.gender === "female" ? "여아" : "남아"}
체중: ${cat.weight_kg ? cat.weight_kg + "kg" : "미측정"} | 중성화: ${cat.is_neutered ? "완료" : "미완료"}
냥BTI: ${cat.nyanBTI_type || "미검사"}
현재 사료: ${cat.current_food || "미입력"}
건강 특이사항: ${cat.health_notes || "없음"}
`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const body = await req.json();
    const { catId, conversationHistory = [], reEntry } = body as {
      catId?: string;
      message?: string;
      conversationHistory?: { role: string; content: string }[];
      reEntry?: boolean;
    };
    const message = typeof body.message === "string" ? body.message : "";

    if (!catId || typeof catId !== "string") {
      return new Response(JSON.stringify({ error: "catId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const isReEntry = Boolean(reEntry);
    if (!isReEntry && !message.trim()) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const dynamicContext = await buildDynamicContext(catId);
    const slotKr = agentTimeSlotLabelKr();
    let systemPrompt =
      STATIC_PROMPT +
      "\n\n" +
      `현재 시간대: ${slotKr}\n이 시간대에 맞는 자연스러운 대화를 해줘.` +
      "\n\n" +
      dynamicContext;

    if (isReEntry) {
      systemPrompt +=
        "\n\n추가 지시 (대화창 재진입) — 반드시 지켜:\n" +
        "사용자가 채팅 화면을 다시 열었어.\n" +
        "이전 대화 마지막 내용을 보고\n" +
        "- 마지막 주제를 자연스럽게 이어받아\n" +
        "- **재방문 인사는 쓰지 마.** (예: \"다시 왔네요\", \"다시 오셨\", \"돌아오셨\" 등 표현 금지)\n" +
        "- 바로 이어지는 질문 1문장으로 시작해\n" +
        "- 선택지 칩 2~3개 (시스템 \"## 선택지 출력 형식\"대로만: [item1] [item2] …)\n" +
        "\n" +
        "예시: 아까 코코 밥 얘기 했는데 결국 먹었나요? [먹었어요] [아직요] [조금 먹었어요]";
    }

    const history = (conversationHistory ?? [])
      .filter((m) => m.role === "assistant" || m.role === "user")
      .slice(-10)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" as const : "user" as const,
        content: String(m.content ?? ""),
      }));

    const messages = isReEntry
      ? [
        ...history,
        {
          role: "user" as const,
          content:
            "(시스템 안내) 채팅 화면 재진입. 위 재진입 지시대로 한 번에 답해. 선택지는 [item1] [item2] 형식만.",
        },
      ]
      : [...history, { role: "user" as const, content: message.trim() }];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 600,
      system: systemPrompt,
      messages,
    });

    return new Response(
      JSON.stringify({ text: response.content[0].text }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
