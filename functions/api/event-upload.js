function extFromType(type, filename) {
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  };
  if (map[type]) return map[type];

  const m = (filename || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "bin";
}

function randomName(ext) {
  const rnd = Math.random().toString(16).slice(2, 10);
  return `${Date.now()}-${rnd}.${ext}`;
}

function isValidEventId(id) {
  return typeof id === "string" && /^[a-z0-9-]{3,80}$/.test(id);
}

export async function onRequestPost({ request, env }) {
  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) {
    return new Response("Expected multipart/form-data", { status: 400 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const eventId = form.get("eventId");
  const descRaw = form.get("desc");
  const desc = typeof descRaw === "string" ? descRaw.trim() : "";

  if (typeof eventId !== "string" || !isValidEventId(eventId)) {
    return new Response("Invalid eventId", { status: 400 });
  }

  if (!file || typeof file === "string") {
    return new Response("Missing file", { status: 400 });
  }

  if (!file.type?.startsWith("image/")) {
    return new Response("Only image uploads allowed", { status: 400 });
  }

  // Match your general upload limit (50MB)
  const MAX = 50 * 1024 * 1024;
  if (file.size > MAX) {
    return new Response("File too large", { status: 413 });
  }

  const manifestKey = `events/${eventId}/manifest.json`;
  const manifestObj = await env.PHOTO_BUCKET.get(manifestKey);
  if (!manifestObj) {
    return new Response("Event not found", { status: 404 });
  }

  let manifest;
  try {
    manifest = await manifestObj.json();
  } catch {
    return new Response("Invalid manifest", { status: 500 });
  }

  const ext = extFromType(file.type, file.name);
  const filename = randomName(ext);
  const key = `events/${eventId}/${filename}`;

  await env.PHOTO_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  if (!Array.isArray(manifest.photos)) manifest.photos = [];
  manifest.photos.push({
    file: filename,
    desc,
    uploadedAt: new Date().toISOString(),
  });

  // Default cover to first photo if missing
  if (!manifest.cover && filename) manifest.cover = filename;
  manifest.updatedAt = new Date().toISOString();

  await env.PHOTO_BUCKET.put(manifestKey, JSON.stringify(manifest), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  return new Response(JSON.stringify({ ok: true, key, eventId, file: filename }), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
