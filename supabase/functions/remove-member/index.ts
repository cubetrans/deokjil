// 덕질역 · 회원 강제 탈퇴 (Supabase Edge Function)
// - 관리자(manager) 이상만 호출할 수 있고, 자기보다 낮은 역할의 회원만 탈퇴시킬 수 있어요.
// - 그 회원의 가입 이메일로 사유와 함께 알림 메일을 보낸 뒤 계정을 지워요. (기록은 member_removals 에 남아요)
// 필요한 Secrets: SMTP_HOST(기본 smtp.naver.com) SMTP_PORT(기본 465) SMTP_USER SMTP_PASS  (+선택: SMTP_FROM, SITE_NAME, SITE_URL)
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 자동으로 넣어 줘요.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const RANK: Record<string, number> = { user: 0, subadmin: 1, manager: 2, admin: 3 };
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json; charset=utf-8" } });
const fail = (error: string, status = 400, code = "") => reply({ ok: false, error, code }, status);

// 한글 제목을 메일 규격(RFC 2047, Base64)대로 직접 인코딩해요. 라이브러리 기본 인코딩은 받는 쪽에 따라 깨져 보일 수 있어요.
function mimeSubject(subj: string): string {
  const enc = new TextEncoder(), parts: string[] = [];
  let chunk: number[] = [];
  const flush = () => { if (chunk.length) { parts.push("=?UTF-8?B?" + btoa(String.fromCharCode(...chunk)) + "?="); chunk = []; } };
  for (const ch of subj) {                       // 글자 단위로 자르면 한글이 중간에 끊기지 않아요
    const b = Array.from(enc.encode(ch));
    if (chunk.length + b.length > 42) flush();   // 인코딩 한 덩어리는 75자 이내
    chunk.push(...b);
  }
  flush();
  return parts.join(" ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("POST 만 쓸 수 있어요.", 405);

  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return fail("로그인이 필요해요.", 401);

  // 1) 호출한 사람 확인 (토큰 → 사용자 → 역할)
  const caller = (await createClient(url, anon).auth.getUser(token)).data.user;
  if (!caller) return fail("로그인이 필요해요.", 401);
  const db = createClient(url, srv, { auth: { persistSession: false } });
  const me = (await db.from("profiles").select("id,nick,role").eq("id", caller.id).maybeSingle()).data;
  if (!me || (RANK[me.role] ?? 0) < 2) return fail("관리자 이상만 할 수 있어요.", 403);

  // 2) 입력 검사
  let body: { id?: string; reason?: string; skipMail?: boolean };
  try { body = await req.json(); } catch { return fail("요청 형식이 올바르지 않아요."); }
  const id = String(body.id || ""), reason = String(body.reason || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("회원 정보가 올바르지 않아요.");
  if (reason.length < 5) return fail("탈퇴 사유를 5자 이상 적어 주세요.");
  if (reason.length > 500) return fail("탈퇴 사유는 500자 이하로 적어 주세요.");
  if (id === me.id) return fail("나 자신은 탈퇴시킬 수 없어요.", 403);

  const target = (await db.from("profiles").select("id,nick,role").eq("id", id).maybeSingle()).data;
  if (!target) return fail("회원을 찾을 수 없어요.", 404);
  if ((RANK[target.role] ?? 0) >= (RANK[me.role] ?? 0)) return fail("나와 같거나 높은 역할의 회원은 탈퇴시킬 수 없어요.", 403);

  // 3) 알림을 보낼 이메일 (예전 가입 방식의 가짜 주소 @deokjil.site 는 받을 수 없어요)
  const au = (await db.auth.admin.getUserById(id)).data.user;
  const email = (au?.email || "").toLowerCase();
  const canMail = !!email && !email.endsWith("@deokjil.site") && !!au?.email_confirmed_at;
  if (!canMail && !body.skipMail) return fail("이 회원은 알림을 보낼 이메일 주소가 없어요.", 409, "no_email");

  // 4) 계정 삭제 (글은 남고 작성자 연결만 끊겨요 / 댓글·쪽지 등은 함께 지워져요)
  const del = await db.auth.admin.deleteUser(id);
  if (del.error) return fail("계정을 지우지 못했어요: " + del.error.message, 500);

  // 5) 알림 메일 (삭제 뒤에 보내므로 실패해도 탈퇴는 이미 끝난 상태 → 결과만 알려 줘요)
  let mailed = false, mailNote = canMail ? "" : "이메일 없음";
  if (canMail) {
    const user = Deno.env.get("SMTP_USER"), pass = Deno.env.get("SMTP_PASS");
    if (!user || !pass) mailNote = "서버에 SMTP 설정이 없어요";
    else {
      const site = Deno.env.get("SITE_NAME") || "덕질역", siteUrl = Deno.env.get("SITE_URL") || "https://deokjil.xyz";
      // 보내는 사람은 전체 메일 주소여야 해요. SMTP_FROM 이 없고 SMTP_USER 가 아이디만이면 @naver.com 을 붙여요.
      const from = (Deno.env.get("SMTP_FROM") || (user.includes("@") ? user : user + "@naver.com")).trim();
      const text =
`안녕하세요, ${target.nick}님.

${site} 운영진이 회원님의 계정을 탈퇴 처리했어요.

■ 탈퇴 사유
${reason}

■ 안내
- 계정과 댓글, 쪽지, 보유 포인트는 삭제되었고 되돌릴 수 없어요.
- 작성하신 글은 작성자 연결이 해제된 상태로 남아 있을 수 있어요.
- 사유에 이의가 있으시면 ${siteUrl} 운영진에게 따로 연락해 주세요.

${site} 운영진`;
      try {
        // 메일 라이브러리는 여기서 불러와요 → 라이브러리가 말썽이어도 탈퇴 처리 자체는 동작해요
        const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
        const client = new SMTPClient({
          connection: { hostname: Deno.env.get("SMTP_HOST") || "smtp.naver.com", port: Number(Deno.env.get("SMTP_PORT") || 465), tls: true, auth: { username: user, password: pass } },
        });
        await client.send({ from, to: email, subject: mimeSubject(`[${site}] 계정 탈퇴 처리 안내`), content: text });
        await client.close();
        mailed = true;
      } catch (e) { mailNote = "메일 발송 실패: " + String((e as Error).message || e).slice(0, 120); }
    }
  }

  // 6) 기록
  await db.from("member_removals").insert({ nick: target.nick, role: target.role, reason, by_id: me.id, by_nick: me.nick, mailed, mail_note: mailNote });
  return reply({ ok: true, mailed, mailNote });
});
