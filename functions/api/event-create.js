function slugify(input) {
  const s = (input || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s;
}

function isValidEventId(id) {
  return typeof id === "string" && /^[a-z0-9-]{3,80}$/.test(id);
}

function randomSuffix() {
  return Math.random().toString(16).slice(2, 8);
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Expected JSON", { status: 400 });
  }

  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const date = typeof body?.date === "string" ? body.date.trim() : ""; // YYYY-MM-DD (recommended)
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  if (!title) return new Response("Missing title", { status: 400 });
  if (!date) return new Response("Missing date", { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response("Invalid date format (YYYY-MM-DD)", { status: 400 });
  }

  const base = slugify(title) || "event";
  const eventId = `${date}-${base}-${randomSuffix()}`;
  if (!isValidEventId(eventId)) {
    return new Response("Failed to generate eventId", { status: 500 });
  }

  const manifestKey = `events/${eventId}/manifest.json`;
  const exists = await env.PHOTO_BUCKET.get(manifestKey);
  if (exists) {
    return new Response("Event already exists", { status: 409 });
  }

  const manifest = {
    eventId,
    title,
    date,
    note,
    cover: "",
    photos: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await env.PHOTO_BUCKET.put(manifestKey, JSON.stringify(manifest), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  return new Response(JSON.stringify({ ok: true, eventId }), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
