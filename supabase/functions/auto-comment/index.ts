import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const BOT_DEVICE_ID = "hi_ai_bot";
const BOT_NAME = "Hi-Rola";

const COMMENTS: Record<string, string[]> = {
  walking: [
    "오늘도 꾸준히 걸으셨군요 🚶 천천히라도 매일 이렇게 하면 몸이 달라져요!",
    "걷기만큼 좋은 운동이 없죠 😊 오늘 하루도 수고 많으셨어요!",
    "꾸준한 걷기가 최고의 건강 비결이에요 🌿 멋져요!",
    "한 걸음 한 걸음이 쌓여서 큰 변화가 생기죠 💪 오늘도 화이팅!",
    "걷기 완료! 오늘 하루도 건강하게 마무리하셨네요 👏",
  ],
  running: [
    "달리기 완료! 정말 대단해요 🏃 오늘도 멋지게 해내셨네요!",
    "힘차게 달리셨군요 🔥 이 기세 계속 유지해요!",
    "러닝 완료 축하드려요 🎉 몸이 점점 강해지고 있을 거예요!",
    "오늘도 달리셨다니 존경스러워요 😤 정말 대단합니다!",
    "달리기만큼 상쾌한 운동이 없죠 💨 잘하셨어요!",
  ],
  cycling: [
    "자전거 라이딩 완료! 정말 멋진 하루네요 🚴 수고하셨어요!",
    "씩씩하게 페달 밟으셨군요 💪 오늘도 건강 챙기셨네요!",
    "라이딩 완료! 시원한 바람을 느끼며 달리셨겠어요 🌬️ 최고예요!",
  ],
  swimming: [
    "수영 완료! 전신 운동이라 더 값진 시간이었을 거예요 🏊 수고하셨어요!",
    "물속에서도 열심히 하셨군요 💦 정말 대단해요!",
    "수영은 관절에도 좋고 정말 좋은 운동이죠 😊 잘하셨어요!",
  ],
  yoga: [
    "요가로 몸과 마음을 정돈하셨군요 🧘 오늘 하루도 수고하셨어요!",
    "유연성도 키우고 마음도 편안해지는 시간이었겠어요 🌸 멋져요!",
    "요가 완료! 내면의 평화를 찾는 시간이었겠네요 ✨",
  ],
  strength: [
    "근력 운동 완료! 오늘도 근육이 한 뼘 자랐겠어요 💪 수고하셨어요!",
    "묵직하게 운동하셨군요 🏋️ 꾸준함이 진짜 실력이에요!",
    "근력 운동은 배신이 없죠 🔥 오늘도 대단해요!",
  ],
  default: [
    "오늘도 운동 완료! 정말 대단해요 💪 꾸준함이 최고예요!",
    "건강을 위해 오늘도 열심히 하셨군요 😊 수고 많으셨어요!",
    "하루하루 이렇게 쌓여가는 게 진짜 건강이죠 🌟 잘하셨어요!",
    "오늘도 멋지게 해내셨네요 👏 이 기세로 계속 화이팅!",
    "운동 완료! 오늘 하루도 건강하게 마무리하셨네요 🌿",
    "꾸준히 하시는 모습이 정말 멋져요 ✨ 응원합니다!",
    "작은 실천이 모여 큰 변화가 생기죠 🔥 오늘도 수고하셨어요!",
    "건강한 습관을 만들어가고 계시네요 😄 대단해요!",
  ],
};

function pickComment(exTag: string): string {
  const tag = (exTag || "").toLowerCase();
  const pool = COMMENTS[tag] || COMMENTS["default"];
  return pool[Math.floor(Math.random() * pool.length)];
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
      return json({ error: "Supabase env not configured" }, 500);

    const payload = await req.json();
    console.log("[auto-comment] type:", payload?.type, "id:", payload?.record?.id);

    const record = payload?.record;
    if (!record) return json({ ok: true, skipped: "no record" });
    if (payload?.type !== "INSERT") return json({ ok: true, skipped: "not insert" });

    const postId = String(record.id || "").trim();
    const postBody = String(record.body || "").trim();
    const exTag = String(record.exTag || record.extag || "").trim();

    if (!postId || !postBody) return json({ ok: true, skipped: "empty post" });

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 10~20초 딜레이 (자연스럽게)
    await delay(10000 + Math.random() * 10000);

    // 글이 삭제됐는지 확인
    const { data: existing } = await db.from("posts").select("id").eq("id", postId).single();
    if (!existing) return json({ ok: true, skipped: "post deleted" });

    const commentBody = pickComment(exTag);
    const commentId = String(Date.now());

    const { error: insertErr } = await db.from("post_comments").insert({
      id: commentId,
      postId,
      deviceId: BOT_DEVICE_ID,
      userName: BOT_NAME,
      body: commentBody,
      ts: commentId,
    });

    if (insertErr) throw insertErr;
    console.log("[auto-comment] commented on post:", postId, "→", commentBody);
    return json({ ok: true, commentId });
  } catch (e) {
    console.error("[auto-comment] error:", e);
    return json({ error: String(e) }, 500);
  }
});
