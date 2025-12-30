export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) return new Response("Missing key", { status: 400 });

  const metaKey = `${key}.meta.json`;
  const obj = await env.PHOTO_BUCKET.get(metaKey);

  if (!obj) {
    return new Response(JSON.stringify({ desc: "" }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  let desc = "";
  try {
    const data = await obj.json();
    desc = typeof data?.desc === "string" ? data.desc : "";
  } catch {
    desc = "";
  }

  return new Response(JSON.stringify({ desc }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, max-age=60",
    },
  });
}
