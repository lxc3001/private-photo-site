const gallery = document.getElementById("gallery");

// ✅ 动态列表（从 /api/list 取）
let PHOTOS = []; // [{ key, desc }]

// ✅ 对齐你现在的读取接口：/api/img?key=
const IMAGE_BASE = "/api/img?key=";

function escapeHtml(s) {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}

function imgUrl(key){
  // IMAGE_BASE 可能是 "/api/img?key=" 或 "/images/"
  if (IMAGE_BASE.includes("?key=")) return `${IMAGE_BASE}${encodeURIComponent(key)}`;
  return `${IMAGE_BASE}${key}`;
}

function render() {
  gallery.innerHTML = PHOTOS.map((p, idx) => `
    <figure class="photo" data-idx="${idx}">
      <img loading="lazy" src="${imgUrl(p.key)}" alt="${escapeHtml(p.desc)}" />
      <figcaption>${escapeHtml(p.desc)}</figcaption>
    </figure>
  `).join("");

  // ✅ 每次 render 后重新绑定 hover polish（因为节点变了）
  attachHoverPolish();
}

// ✅ 从 R2 拉列表（你的 list.js 返回 { keys: [...] }）
async function loadList() {
  const res = await fetch("/api/list", { cache: "no-store" });
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  const data = await res.json();
  const items = data.items || [];

  // 你当前 list.js 只有 key，没有 desc，所以 desc 先留空
  PHOTOS = items.map((it) => ({ key: it.key, desc: it.desc || "" }));
  render();
}

// 初次加载
loadList().catch(console.error);


/* ---------- Lightbox logic (with prev/next + animation) ---------- */
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxCaption = document.getElementById("lightbox-caption");
const lightboxClose = document.getElementById("lightbox-close");

let currentIndex = -1;

function isLightboxOpen(){
  return lightbox.getAttribute("aria-hidden") === "false";
}

function setLightboxContent(idx){
  currentIndex = idx;
  const photo = PHOTOS[currentIndex];
  lightboxImg.src = imgUrl(photo.key);
  lightboxImg.alt = photo.desc || "";
  lightboxCaption.textContent = photo.desc || "";
}

function openLightbox(idx){
  setLightboxContent(idx);
  lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeLightbox(){
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImg.src = "";
  document.body.style.overflow = "";
  currentIndex = -1;
}

function showNext(){
  if (!isLightboxOpen() || PHOTOS.length === 0) return;
  const next = (currentIndex + 1) % PHOTOS.length;
  setLightboxContent(next);
}

function showPrev(){
  if (!isLightboxOpen() || PHOTOS.length === 0) return;
  const prev = (currentIndex - 1 + PHOTOS.length) % PHOTOS.length;
  setLightboxContent(prev);
}

// 点击卡片打开
gallery.addEventListener("click", (e) => {
  const card = e.target.closest(".photo");
  if (!card) return;
  const idx = Number(card.dataset.idx);
  if (Number.isNaN(idx)) return;
  openLightbox(idx);
});

// 关闭：点背景或点 X
lightbox.addEventListener("click", (e) => {
  if (e.target?.dataset?.close === "1") closeLightbox();
});
lightboxClose.addEventListener("click", closeLightbox);

// 键盘：Esc 关闭；左右切换
window.addEventListener("keydown", (e) => {
  if (!isLightboxOpen()) return;

  if (e.key === "Escape") return closeLightbox();
  if (e.key === "ArrowRight") { e.preventDefault(); return showNext(); }
  if (e.key === "ArrowLeft")  { e.preventDefault(); return showPrev(); }
});


/* ===== Hover polish: cursor-aware shadow + subtle highlight ===== */
function attachHoverPolish() {
  const cards = document.querySelectorAll(".photo");

  cards.forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;

      card.style.setProperty("--mx", `${Math.round(px * 100)}%`);
      card.style.setProperty("--my", `${Math.round(py * 100)}%`);

      const dx = (px - 0.5) * 24;
      const dy = (py - 0.5) * 16;

      card.style.setProperty("--sx", `${dx.toFixed(1)}px`);
      card.style.setProperty("--sy", `${(14 + dy).toFixed(1)}px`);
    });

    card.addEventListener("mouseleave", () => {
      card.style.setProperty("--mx", `50%`);
      card.style.setProperty("--my", `35%`);
      card.style.setProperty("--sx", `0px`);
      card.style.setProperty("--sy", `14px`);
    });
  });
}


/* ---------- Upload (real) ---------- */
const uploadBtn = document.getElementById("upload-btn");
const dialog = document.getElementById("upload-dialog");
const closeBtn = document.getElementById("close-dialog");
const fileInput = document.getElementById("file-input");
const descInput = document.getElementById("desc-input");
const doUpload = document.getElementById("fake-upload"); // 你按钮 id 叫 fake-upload，我沿用

uploadBtn.onclick = () => dialog.showModal();
closeBtn.onclick = () => dialog.close();

doUpload.onclick = async () => {
  const file = fileInput?.files?.[0];
  const desc = (descInput?.value || "").trim(); // 目前后端可先忽略 desc

  if (!file) return alert("请选择一张图片");
  if (!file.type?.startsWith("image/")) return alert("只能上传图片文件");

  doUpload.disabled = true;
  doUpload.textContent = "上传中...";

  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("desc", desc);

    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(t || `上传失败: ${res.status}`);
    }

    // 清空输入并关闭
    fileInput.value = "";
    if (descInput) descInput.value = "";
    dialog.close();

    // ✅ 重新拉列表刷新瀑布流
    await loadList();
  } catch (e) {
    alert(e.message || String(e));
  } finally {
    doUpload.disabled = false;
    doUpload.textContent = "上传";
  }
};
