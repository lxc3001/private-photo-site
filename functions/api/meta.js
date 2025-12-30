export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) return new Response("Missing key", { status: 400 });

  const h = await env.PHOTO_BUCKET.head(key);
  if (!h) return new Response("Not found", { status: 404 });

  return new Response(JSON.stringify({
    key,
    desc: h.customMetadata?.desc || "",
  }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, max-age=60",
    },
  });
}
