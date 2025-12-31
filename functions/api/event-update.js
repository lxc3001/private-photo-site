function isValidEventId(id) {
  return typeof id === "string" && /^[a-z0-9-]{3,80}$/.test(id);
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Expected JSON", { status: 400 });
  }

  const eventId = typeof body?.eventId === "string" ? body.eventId.trim() : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const date = typeof body?.date === "string" ? body.date.trim() : "";
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  if (!eventId) return new Response("Missing eventId", { status: 400 });
  if (!isValidEventId(eventId)) return new Response("Invalid eventId", { status: 400 });
  if (!title) return new Response("Missing title", { status: 400 });
  if (!date) return new Response("Missing date", { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response("Invalid date format (YYYY-MM-DD)", { status: 400 });
  }

  const manifestKey = `events/${eventId}/manifest.json`;
  const obj = await env.PHOTO_BUCKET.get(manifestKey);
  if (!obj) return new Response("Not found", { status: 404 });

  let manifest;
  try {
    manifest = await obj.json();
  } catch {
    return new Response("Invalid manifest", { status: 500 });
  }

  // Update only editable fields.
  manifest.title = title;
  manifest.date = date;
  manifest.note = note;
  manifest.updatedAt = new Date().toISOString();

  await env.PHOTO_BUCKET.put(manifestKey, JSON.stringify(manifest), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
