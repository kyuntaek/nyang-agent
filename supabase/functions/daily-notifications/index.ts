/**
 * 매일 아침(예: 08:00 KST) Cron으로 호출.
 *
 * 1) 오늘(Asia/Seoul) 기념일 → "🎂 오늘은 {냥이} {제목}이에요!"
 * 2) D-7 기념일 → "🎂 {냥이} {제목}이 일주일 남았어요!"
 * 3) push_token 이 있는 모든 유저 → 아침 인사 (첫 냥이 이름 사용)
 *
 * 호출 시 헤더: `x-internal-secret: <INTERNAL_PUSH_SECRET>` (send-push 와 동일)
 */
import { createClient } from "npm:@supabase/supabase-js";

function seoulYmd(d = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d + days, 12, 0, 0);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

function monthDayFromYmd(ymd: string): { m: number; d: number } {
  const [, mm, dd] = ymd.split("-").map(Number);
  return { m: mm, d: dd };
}

function monthDayFromDateCol(iso: string): { m: number; d: number } {
  const ymd = iso.slice(0, 10);
  return monthDayFromYmd(ymd);
}

type CatEmbed = { name: string | null; user_id: string } | { name: string | null; user_id: string }[] | null;

function pickCat(row: { cats: CatEmbed }): { name: string; user_id: string } | null {
  const c = row.cats;
  if (c == null) return null;
  const x = Array.isArray(c) ? c[0] : c;
  if (!x?.user_id) return null;
  const name = (x.name ?? "냥이").trim() || "냥이";
  return { name, user_id: x.user_id };
}

async function invokeSendPush(
  supabaseUrl: string,
  pushToken: string,
  title: string,
  body: string,
  secret: string
): Promise<{ ok: boolean; detail?: unknown }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
    },
    body: JSON.stringify({ push_token: pushToken, title, body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, detail: json };
  return { ok: true, detail: json };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const expected = Deno.env.get("INTERNAL_PUSH_SECRET");
  const provided = req.headers.get("x-internal-secret");
  if (!expected || provided !== expected) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const secret = expected;
  const supabase = createClient(supabaseUrl, serviceKey);

  const todaySeoul = seoulYmd();
  const d7Seoul = addDaysYmd(todaySeoul, 7);
  const todayMd = monthDayFromYmd(todaySeoul);
  const d7Md = monthDayFromYmd(d7Seoul);

  const results: {
    anniversary_today: number;
    anniversary_d7: number;
    morning: number;
    errors: string[];
  } = {
    anniversary_today: 0,
    anniversary_d7: 0,
    morning: 0,
    errors: [],
  };

  try {
    const { data: annRows, error: annErr } = await supabase.from("anniversaries").select(
      "id, title, date, repeat_yearly, cats(name, user_id)"
    );

    if (annErr) throw annErr;

    type AnnRow = {
      id: string;
      title: string;
      date: string;
      repeat_yearly: boolean;
      cats: CatEmbed;
    };

    for (const row of (annRows ?? []) as AnnRow[]) {
      const cat = pickCat(row);
      if (!cat) continue;

      const eventMd = monthDayFromDateCol(row.date);
      const fullYmd = row.date.slice(0, 10);

      let isToday = false;
      let isD7 = false;

      if (row.repeat_yearly) {
        isToday = eventMd.m === todayMd.m && eventMd.d === todayMd.d;
        isD7 = eventMd.m === d7Md.m && eventMd.d === d7Md.d;
      } else {
        isToday = fullYmd === todaySeoul;
        isD7 = fullYmd === d7Seoul;
      }

      if (!isToday && !isD7) continue;

      const { data: prof } = await supabase
        .from("profiles")
        .select("push_token")
        .eq("id", cat.user_id)
        .maybeSingle();

      const token = prof?.push_token?.trim();
      if (!token) continue;

      const title = "기념일 알림";

      if (isToday) {
        const body = `🎂 오늘은 ${cat.name} ${row.title}이에요!`;
        const r = await invokeSendPush(supabaseUrl, token, title, body, secret);
        if (r.ok) results.anniversary_today += 1;
        else results.errors.push(`today ${row.id}: ${JSON.stringify(r.detail)}`);
      }

      if (isD7) {
        const body = `🎂 ${cat.name} ${row.title}이 일주일 남았어요!`;
        const r = await invokeSendPush(supabaseUrl, token, title, body, secret);
        if (r.ok) results.anniversary_d7 += 1;
        else results.errors.push(`d7 ${row.id}: ${JSON.stringify(r.detail)}`);
      }
    }

    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("id, push_token")
      .not("push_token", "is", null);

    if (profErr) throw profErr;

    for (const p of profiles ?? []) {
      const token = p.push_token?.trim();
      if (!token) continue;

      const { data: cat } = await supabase
        .from("cats")
        .select("name")
        .eq("user_id", p.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const catName = (cat?.name ?? "냥이").trim() || "냥이";

      const title = "좋은 아침이에요";
      const body = `☀️ 좋은 아침이에요! ${catName} 오늘 아침밥은요?`;
      const r = await invokeSendPush(supabaseUrl, token, title, body, secret);
      if (r.ok) results.morning += 1;
      else results.errors.push(`morning ${p.id}: ${JSON.stringify(r.detail)}`);
    }

    return jsonResponse({ ok: true, todaySeoul, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: message, results }, 500);
  }
});
