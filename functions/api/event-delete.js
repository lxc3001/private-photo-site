function isValidEventId(id) {
  return typeof id === "string" && /^[a-z0-9-]{3,80}$/.test(id);
}

async function listAllWithPrefix(bucket, prefix) {
  const keys = [];
  let cursor;

  for (let page = 0; page < 200; page++) {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const obj of listed.objects || []) keys.push(obj.key);
    if (!listed.truncated) break;
    cursor = listed.cursor;
    if (!cursor) break;
  }

  return keys;
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Expected JSON", { status: 400 });
  }

  const eventId = typeof body?.eventId === "string" ? body.eventId.trim() : "";
  const force = body?.force === true;

  if (!eventId) return new Response("Missing eventId", { status: 400 });
  if (!isValidEventId(eventId)) return new Response("Invalid eventId", { status: 400 });
  if (!force) return new Response("Missing force=true", { status: 400 });

  const prefix = `events/${eventId}/`;
  const keys = await listAllWithPrefix(env.PHOTO_BUCKET, prefix);

  if (keys.length === 0) {
    // Either already deleted or never existed
    return new Response(JSON.stringify({ ok: true, deleted: 0 }), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  // Delete in chunks (R2 supports batch delete)
  const CHUNK = 1000;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const batch = keys.slice(i, i + CHUNK);
    await env.PHOTO_BUCKET.delete(batch);
  }

  return new Response(JSON.stringify({ ok: true, deleted: keys.length }), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
