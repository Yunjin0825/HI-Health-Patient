import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

function b64u(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function b64uDecode(s: string): Uint8Array {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b), c => c.charCodeAt(0));
}

async function makeVapidJwt(audience: string, subject: string, publicKeyB64u: string, privateKeyB64u: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64u(new TextEncoder().encode(JSON.stringify({ aud: audience, exp: now + 3600, sub: subject })));
  const unsigned = `${header}.${payload}`;
  const privKey = await crypto.subtle.importKey(
    "pkcs8",
    (() => {
      const raw = b64uDecode(privateKeyB64u);
      // wrap raw 32-byte EC private key in PKCS8 header for P-256
      const prefix = new Uint8Array([0x30,0x41,0x02,0x01,0x00,0x30,0x13,0x06,0x07,0x2a,0x86,0x48,0xce,0x3d,0x02,0x01,0x06,0x08,0x2a,0x86,0x48,0xce,0x3d,0x03,0x01,0x07,0x04,0x27,0x30,0x25,0x02,0x01,0x01,0x04,0x20]);
      const combined = new Uint8Array(prefix.length + raw.length);
      combined.set(prefix); combined.set(raw, prefix.length);
      return combined.buffer;
    })(),
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privKey,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${b64u(sig)}`;
}

type PushRow = {
  id: string;
  endpoint: string;
  device_id?: string | null;
  emp_id?: string | null;
  subscription?: Record<string, unknown> | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:hello@hihealth.app";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return json({ error: "Push secret is not configured." }, 500);
    }

    const { title, body, url, deviceId, empId, tag } = await req.json();
    if (!title || !body) return json({ error: "title and body are required." }, 400);

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let query = db
      .from("push_subscriptions")
      .select("id, endpoint, device_id, emp_id, subscription")
      .eq("enabled", true);

    if (deviceId) query = query.eq("device_id", String(deviceId));
    else if (empId) query = query.eq("emp_id", String(empId).toUpperCase());

    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);

    const rows = (data || []) as PushRow[];
    if (!rows.length) return json({ sent: 0, failed: 0, invalid: 0, total: 0 });

    const pushPayload = JSON.stringify({
      title: String(title), body: String(body),
      url: String(url || "./index.html#community"),
      tag: String(tag || `hi-health-${Date.now()}`),
      sentAt: new Date().toISOString(),
    });

    let sent = 0, failed = 0, invalid = 0;
    const invalidEndpoints: string[] = [];

    for (const row of rows) {
      const sub = row.subscription as any;
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        invalid++; invalidEndpoints.push(row.endpoint); continue;
      }
      try {
        const origin = new URL(sub.endpoint).origin;
        const jwt = await makeVapidJwt(origin, VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
        const res = await fetch(sub.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "TTL": "60",
            "Authorization": `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
            "Content-Encoding": "aes128gcm",
          },
          body: new TextEncoder().encode(pushPayload),
        });
        if (res.status === 404 || res.status === 410) {
          invalid++; invalidEndpoints.push(row.endpoint);
        } else if (!res.ok) {
          failed++; console.error("push failed", row.endpoint, res.status);
        } else {
          sent++;
        }
      } catch (err) {
        failed++; console.error("push error", row.endpoint, err);
      }
    }

    if (invalidEndpoints.length) {
      await db.from("push_subscriptions")
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .in("endpoint", invalidEndpoints);
    }

    return json({ sent, failed, invalid, total: rows.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
