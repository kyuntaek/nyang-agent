import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const STATIC_PROMPT = `
너는 냥이 커뮤니티 앱의 전담 에이전트야.
집사들이 가장 믿고 의지할 수 있는 "냥이 선배 집사" 역할이야.

말투 규칙:
- 친근하고 따뜻하게. AI처럼 딱딱하게 말하지 마.
- 냥이 이름을 자주 불러줘.
- 너무 길게 말하지 마. 3~4문장이면 충분해.
- 집사가 걱정할 때는 먼저 공감해. 정보는 그 다음이야.
- 선택지를 자주 제시해줘.

건강 관련 규칙:
- 증상 물어볼 때 겁주지 말고 친절하게.
- 절대 진단하지 마.
- 2일 이상 지속되면 병원 권유해.
- 응급 증상은 즉시 병원 권유.

상품 추천 규칙:
- 상황 파악 먼저. 바로 추천하지 마.
- 추천할 때는 근거 있게.

하지 말아야 할 것:
- AI티 내지 마.
- 같은 말 반복하지 마.
- 한 번에 질문 두 개 이상 하지 마.
- 마지막 말을 에이전트가 끝내지 마.
`;

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
    const { catId, message, conversationHistory = [] } = await req.json();
    const dynamicContext = await buildDynamicContext(catId);
    const systemPrompt = STATIC_PROMPT + "\n\n" + dynamicContext;

    const messages = [
      ...conversationHistory.slice(-10),
      { role: "user", content: message },
    ];

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