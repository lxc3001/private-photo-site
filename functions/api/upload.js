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

function genKey(ext) {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rnd = Math.random().toString(16).slice(2, 10);

  return `uploads/${yyyy}-${mm}-${dd}/${Date.now()}-${rnd}.${ext}`;
}

export async function onRequestPost({ request, env }) {
  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) {
    return new Response("Expected multipart/form-data", { status: 400 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const descRaw = form.get("desc");
  const desc = typeof descRaw === "string" ? descRaw.trim() : "";

  if (!file || typeof file === "string") {
    return new Response("Missing file", { status: 400 });
  }

  if (!file.type?.startsWith("image/")) {
    return new Response("Only image uploads allowed", { status: 400 });
  }

  // 可选：限制大小
  const MAX = 50 * 1024 * 1024;
  if (file.size > MAX) {
    return new Response("File too large", { status: 413 });
  }

  const ext = extFromType(file.type, file.name);
  const key = genKey(ext);

  await env.PHOTO_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // Store sidecar metadata for this image (description, etc.)
  // Using a separate object keeps list fast and allows on-demand fetch.
  const metaKey = `${key}.meta.json`;
  const meta = {
    desc,
    updatedAt: new Date().toISOString(),
  };

  await env.PHOTO_BUCKET.put(metaKey, JSON.stringify(meta), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  return new Response(JSON.stringify({ ok: true, key }), {
    headers: { "Content-Type": "application/json" },
  });
}
