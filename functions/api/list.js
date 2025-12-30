export async function onRequestGet({ env }) {
  const listed = await env.PHOTO_BUCKET.list({ limit: 1000 });
  const isImage = (k) => /\.(png|jpe?g|gif|webp|avif)$/i.test(k);

  const items = (listed.objects || [])
    .filter((o) => isImage(o.key))
    .map((o) => ({
      key: o.key,
      desc: o.customMetadata?.desc || "",
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return new Response(JSON.stringify({ items }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, max-age=60",
    },
  });
}
