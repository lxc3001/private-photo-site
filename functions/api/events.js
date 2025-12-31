async function listAllWithPrefix(bucket, prefix) {
  const keys = [];
  let cursor;

  for (let page = 0; page < 100; page++) {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const obj of listed.objects || []) keys.push(obj.key);
    if (!listed.truncated) break;
    cursor = listed.cursor;
    if (!cursor) break;
  }

  return keys;
}

export async function onRequestGet({ env }) {
  const allKeys = await listAllWithPrefix(env.PHOTO_BUCKET, "events/");
  const manifestKeys = allKeys.filter((k) => k.endsWith("/manifest.json"));

  const events = [];
  for (const mk of manifestKeys) {
    const obj = await env.PHOTO_BUCKET.get(mk);
    if (!obj) continue;
    try {
      const m = await obj.json();
      const eventId = typeof m?.eventId === "string" ? m.eventId : "";
      const title = typeof m?.title === "string" ? m.title : "";
      const date = typeof m?.date === "string" ? m.date : "";
      const note = typeof m?.note === "string" ? m.note : "";
      const cover = typeof m?.cover === "string" ? m.cover : "";
      const photos = Array.isArray(m?.photos) ? m.photos : [];

      const coverKey = cover && eventId ? `events/${eventId}/${cover}` : "";

      // Provide a small set of sample photos for the timeline mosaic (max 12).
      // We prefer the most recently uploaded photos (manifest appends on upload).
      const photoFiles = photos
        .map((p) => (typeof p?.file === "string" ? p.file : ""))
        .filter(Boolean);
      const sampleFiles = photoFiles.slice(-12);
      const sampleKeys = eventId
        ? sampleFiles.map((f) => `events/${eventId}/${f}`)
        : [];

      events.push({
        eventId,
        title,
        date,
        note,
        coverKey,
        sampleKeys,
        count: photos.length,
      });
    } catch {
      // ignore invalid manifest
    }
  }

  // Date desc, then title
  events.sort((a, b) => {
    const da = a.date || "";
    const db = b.date || "";
    if (da !== db) return db.localeCompare(da);
    return (a.title || "").localeCompare(b.title || "");
  });

  return new Response(JSON.stringify({ events }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, max-age=30",
    },
  });
}
