export async function onRequestGet({ env }) {
  // 你可以按需加前缀过滤，例如只列出某个文件夹：prefix: "vacation/"
  const listed = await env.PHOTO_BUCKET.list({
    // prefix: "",
    limit: 1000,
  });

  // 只保留常见图片后缀（可按需扩展）
  const isImage = (k) => /\.(png|jpe?g|gif|webp|avif)$/i.test(k);

  const keys = listed.objects
    .map((o) => o.key)
    .filter(isImage)
    .sort(); // 可换成按时间排序等

  return new Response(JSON.stringify({ keys }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, max-age=60",
    },
  });
}
