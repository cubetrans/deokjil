// 덕질역 · 브라우저 푸시 알림 발송 (Supabase Edge Function)
// 새 알림(notifications) / 새 쪽지(dms) 가 생기면 Database Webhook 이 이 함수를 불러요.
// - 쪽지 내용은 알림에 담지 않아요. ("새 쪽지가 왔어요" 만 보내요)
// - 구독이 끊긴 기기(404/410)는 자동으로 지워요.
// 필요한 Secrets: VAPID_PUBLIC_KEY  VAPID_PRIVATE_KEY  VAPID_SUBJECT(예: https://deokjil.xyz — 비워 두면 이 값을 써요)  PUSH_WEBHOOK_SECRET(아무 긴 문자열)
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 자동으로 들어 있어요)
// Webhook 설정: 헤더 x-push-secret = PUSH_WEBHOOK_SECRET, 대상 테이블 notifications·dms 의 INSERT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const reply = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const SITE = (Deno.env.get("SITE_URL") || "https://deokjil.xyz").replace(/\/$/, "");

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ ok: false, error: "POST 만 돼요" }, 405);
  const secret = Deno.env.get("PUSH_WEBHOOK_SECRET") || "";
  if (!secret || req.headers.get("x-push-secret") !== secret) return reply({ ok: false, error: "권한이 없어요" }, 401);

  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return reply({ ok: false, error: "VAPID 키가 없어요" }, 500);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "https://deokjil.xyz", pub, priv);

  let ev: any; try { ev = await req.json(); } catch { return reply({ ok: false, error: "잘못된 요청" }, 400); }
  if (ev.type !== "INSERT" || !ev.record) return reply({ ok: true, skipped: true });
  const r = ev.record;

  let uid = "", payload: Record<string, string> | null = null;
  if (ev.table === "dms") {
    uid = r.recipient_id;
    payload = { title: "덕질역 · 새 쪽지", body: `${r.sender_nick || "누군가"}님이 쪽지를 보냈어요.`, url: `${SITE}/index.html#/messages/${encodeURIComponent(r.sender_nick || "")}`, tag: "dj-dm" };
  } else if (ev.table === "notifications") {
    uid = r.user_id;
    const link = String(r.link || "");
    payload = { title: "덕질역 · 새 알림", body: String(r.text || "새 소식이 있어요.").slice(0, 120), url: link.startsWith("#") ? `${SITE}/index.html${link}` : `${SITE}/index.html#/notifications`, tag: "dj-notif" };
  }
  if (!uid || !payload) return reply({ ok: true, skipped: true });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: subs } = await sb.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", uid);
  let sent = 0, dead: number[] = [];
  await Promise.all((subs || []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
      sent++;
    } catch (e: any) { if (e && (e.statusCode === 404 || e.statusCode === 410)) dead.push(s.id); }
  }));
  if (dead.length) await sb.from("push_subscriptions").delete().in("id", dead);
  return reply({ ok: true, sent, removed: dead.length });
});
