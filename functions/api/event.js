function isValidEventId(id) {
  return typeof id === "string" && /^[a-z0-9-]{3,80}$/.test(id);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId");
  if (!eventId) return new Response("Missing eventId", { status: 400 });
  if (!isValidEventId(eventId)) return new Response("Invalid eventId", { status: 400 });

  const manifestKey = `events/${eventId}/manifest.json`;
  const obj = await env.PHOTO_BUCKET.get(manifestKey);
  if (!obj) return new Response("Not found", { status: 404 });

  let manifest;
  try {
    manifest = await obj.json();
  } catch {
    return new Response("Invalid manifest", { status: 500 });
  }

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, max-age=30",
    },
  });
}
