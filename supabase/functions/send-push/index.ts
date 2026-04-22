/**
 * Expo Push API 프록시.
 * 요청 본문: { push_token, title, body, deep_link_path? }
 * 헤더: x-internal-secret — Supabase Secrets `INTERNAL_PUSH_SECRET` 와 동일해야 함.
 */
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const hasInternalSecret = Boolean(expected && provided === expected);
  const hasServiceRoleBearer = Boolean(serviceRoleKey && bearerToken && bearerToken === serviceRoleKey);
  if (!hasInternalSecret && !hasServiceRoleBearer) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = (await req.json()) as {
      push_token?: string;
      title?: string;
      body?: string;
      deep_link_path?: string;
    };

    const to = payload.push_token?.trim();
    const title = payload.title?.trim() ?? "냥이 에이전트";
    const body = payload.body?.trim() ?? "";
    const deepLinkPath = payload.deep_link_path?.trim();

    if (!to || !body) {
      return jsonResponse({ error: "push_token and body are required" }, 400);
    }

    const expoRes = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to,
        title,
        body,
        sound: "default",
        priority: "high",
        data: deepLinkPath ? { path: deepLinkPath } : undefined,
      }),
    });

    const expoJson = (await expoRes.json()) as {
      data?: { status?: string; message?: string; id?: string };
      errors?: unknown[];
    };

    if (!expoRes.ok) {
      return jsonResponse(
        { error: "Expo push failed", status: expoRes.status, detail: expoJson },
        502
      );
    }

    return jsonResponse({ ok: true, expo: expoJson });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: message }, 500);
  }
});
