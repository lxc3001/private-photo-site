export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) return new Response("Missing key", { status: 400 });

  const obj = await env.PHOTO_BUCKET.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  // ETag / 条件请求（可选但推荐）
  const etag = obj.httpEtag;
  const ifNoneMatch = request.headers.get("If-None-Match");
  if (etag && ifNoneMatch === etag) return new Response(null, { status: 304 });

  const headers = new Headers();
  headers.set("Content-Type", obj.httpMetadata?.contentType || "image/jpeg");
  headers.set("Cache-Control", "private, max-age=3600");
  if (etag) headers.set("ETag", etag);

  return new Response(obj.body, { headers });
}
