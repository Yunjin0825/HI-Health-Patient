import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function b64u(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
function b64uDecode(s: string): Uint8Array {
  const b = s.replace(/-/g,"+").replace(/_/g,"/");
  const pad = b.length % 4 ? "=".repeat(4 - b.length % 4) : "";
  return Uint8Array.from(atob(b + pad), c => c.charCodeAt(0));
}
function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name:"HKDF", hash:"SHA-256", salt, info }, key, len * 8));
}

async function makeVapidJwt(audience: string, subject: string, privB64u: string): Promise<string> {
  const enc = new TextEncoder();
  const header = b64u(enc.encode(JSON.stringify({ typ:"JWT", alg:"ES256" })));
  const payload = b64u(enc.encode(JSON.stringify({ aud:audience, exp:Math.floor(Date.now()/1000)+3600, sub:subject })));
  const unsigned = `${header}.${payload}`;
  const raw = b64uDecode(privB64u);
  const pkcs8 = concat(
    new Uint8Array([0x30,0x41,0x02,0x01,0x00,0x30,0x13,0x06,0x07,0x2a,0x86,0x48,0xce,0x3d,0x02,0x01,
                    0x06,0x08,0x2a,0x86,0x48,0xce,0x3d,0x03,0x01,0x07,0x04,0x27,0x30,0x25,0x02,0x01,0x01,0x04,0x20]),
    raw
  );
  const privKey = await crypto.subtle.importKey("pkcs8", pkcs8, { name:"ECDSA", namedCurve:"P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name:"ECDSA", hash:"SHA-256" }, privKey, enc.encode(unsigned));
  return `${unsigned}.${b64u(sig)}`;
}

async function encryptWebPush(plaintext: string, p256dhB64u: string, authB64u: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const uaPublic = b64uDecode(p256dhB64u);
  const authSecret = b64uDecode(authB64u);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name:"ECDH", namedCurve:"P-256" }, false, []);
  const ephemeral = await crypto.subtle.generateKey({ name:"ECDH", namedCurve:"P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name:"ECDH", public:uaKey }, ephemeral.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name:"AES-GCM", iv:nonce }, aesKey, concat(enc.encode(plaintext), new Uint8Array([2])))
  );
  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

type PushRow = { id: string; endpoint: string; device_id?: string|null; emp_id?: string|null; subscription?: Record<string,unknown>|null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error:"Method not allowed" }, 405);
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:hello@hihealth.app";
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY)
      return json({ error:"Push secret is not configured." }, 500);

    const { title, body, url, deviceId, empId, tag } = await req.json();
    if (!title || !body) return json({ error:"title and body are required." }, 400);

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false, autoRefreshToken:false } });
    let query = db.from("push_subscriptions").select("id,endpoint,device_id,emp_id,subscription").eq("enabled", true);
    if (deviceId) query = query.eq("device_id", String(deviceId));
    else if (empId) query = query.eq("emp_id", String(empId).toUpperCase());

    const { data, error } = await query;
    if (error) return json({ error:error.message }, 500);
    const rows = (data || []) as PushRow[];
    if (!rows.length) return json({ sent:0, failed:0, invalid:0, total:0 });

    const pushPayload = JSON.stringify({
      title:String(title), body:String(body),
      url:String(url||"./index.html#community"),
      tag:String(tag||`hi-health-${Date.now()}`),
      sentAt:new Date().toISOString(),
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
        const jwt = await makeVapidJwt(origin, VAPID_SUBJECT, VAPID_PRIVATE_KEY);
        const encrypted = await encryptWebPush(pushPayload, sub.keys.p256dh, sub.keys.auth);
        const res = await fetch(sub.endpoint, {
          method:"POST",
          headers:{
            "Content-Type":"application/octet-stream",
            "Content-Encoding":"aes128gcm",
            "TTL":"60",
            "Authorization":`vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
          },
          body: encrypted,
        });
        if (res.status === 404 || res.status === 410) {
          invalid++; invalidEndpoints.push(row.endpoint);
        } else if (!res.ok) {
          failed++; console.error("push failed", res.status, await res.text().catch(()=>''));
        } else {
          sent++;
        }
      } catch (err) {
        failed++; console.error("push error", err);
      }
    }

    if (invalidEndpoints.length) {
      await db.from("push_subscriptions")
        .update({ enabled:false, updated_at:new Date().toISOString() })
        .in("endpoint", invalidEndpoints);
    }
    return json({ sent, failed, invalid, total:rows.length });
  } catch (e) {
    return json({ error:(e as Error).message }, 500);
  }
});
