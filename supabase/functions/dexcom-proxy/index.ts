const DEXCOM_BASE = 'https://shareous1.dexcom.com/ShareWebServices/Services';
const DEXCOM_APP_ID = 'd8665ade-9673-4e27-9ff6-92db4ce13d13';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { username, password } = await req.json();
    if (!username || !password) return json({ error: '아이디와 비밀번호를 입력해주세요.' }, 400);

    // 1. 로그인 → 세션 토큰
    const loginRes = await fetch(`${DEXCOM_BASE}/General/LoginPublisherAccountByName`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ accountName: username, password, applicationId: DEXCOM_APP_ID }),
    });

    const sessionId: string = await loginRes.json();
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 10) {
      return json({ error: '로그인 실패. 덱스콤 아이디/비밀번호를 확인해주세요.' }, 401);
    }

    // 2. 최근 혈당값 가져오기
    const glucRes = await fetch(
      `${DEXCOM_BASE}/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${encodeURIComponent(sessionId)}&minutes=1440&maxCount=3`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } }
    );

    const readings = await glucRes.json();
    if (!Array.isArray(readings)) return json({ error: '혈당 데이터를 가져오지 못했어요.' }, 502);

    const result = readings.map((r: Record<string, unknown>) => ({
      value: r.Value,          // mg/dL
      trend: r.Trend,          // 0–7 (트렌드 코드)
      trendArrow: trendArrow(r.Trend as number),
      time: r.ST,              // "/Date(...)/" 형식
    }));

    return json({ readings: result });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function trendArrow(code: number): string {
  const map: Record<number, string> = {
    1: '⇈', 2: '↑', 3: '↗', 4: '→', 5: '↘', 6: '↓', 7: '⇊',
  };
  return map[code] ?? '—';
}
