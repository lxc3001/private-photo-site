const gallery = document.getElementById("gallery");

// 先用静态列表做视觉测试（后面改成 fetch list）
const PHOTOS = [
  { key: "vacation/001.jpg", desc: "描述位置（可改/可空）" },
  { key: "vacation/002.jpg", desc: "第二张照片的描述" },
  { key: "cats/mimi.png",     desc: "" },
];

// 如果你在本地用 images/ 测试，把它改为 "/images/"
const IMAGE_BASE = "/api/image?key=";

function escapeHtml(s) {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}

function imgUrl(key){
  // IMAGE_BASE 可能是 "/api/image?key=" 或 "/images/"
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
}
render();

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
  // 可选：清空 src，避免关闭后仍占带宽/解码资源
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

  if (e.key === "Escape") {
    closeLightbox();
    return;
  }
  if (e.key === "ArrowRight") {
    e.preventDefault();
    showNext();
    return;
  }
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    showPrev();
    return;
  }
});


/* ---------- Upload placeholder ---------- */
const uploadBtn = document.getElementById("upload-btn");
const dialog = document.getElementById("upload-dialog");
const closeBtn = document.getElementById("close-dialog");
const fakeUpload = document.getElementById("fake-upload");

uploadBtn.onclick = () => dialog.showModal();
closeBtn.onclick = () => dialog.close();
fakeUpload.onclick = () => {
  alert("上传逻辑还没接入：下一步接 Worker 生成 presigned PUT URL → 浏览器直传 R2。");
};
