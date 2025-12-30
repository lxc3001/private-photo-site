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

/* ---------- Lightbox logic ---------- */
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxCaption = document.getElementById("lightbox-caption");
const lightboxClose = document.getElementById("lightbox-close");

function openLightbox(photo){
  lightboxImg.src = imgUrl(photo.key);
  lightboxImg.alt = photo.desc || "";
  lightboxCaption.textContent = photo.desc || "";
  lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeLightbox(){
  lightbox.setAttribute("aria-hidden", "true");
  // 避免大图还在加载时占资源：可选清空
  lightboxImg.src = "";
  document.body.style.overflow = "";
}

// 点击卡片打开
gallery.addEventListener("click", (e) => {
  const card = e.target.closest(".photo");
  if (!card) return;
  const idx = Number(card.dataset.idx);
  const photo = PHOTOS[idx];
  if (!photo) return;
  openLightbox(photo);
});

// 关闭：点背景或点 X
lightbox.addEventListener("click", (e) => {
  if (e.target?.dataset?.close === "1") closeLightbox();
});
lightboxClose.addEventListener("click", closeLightbox);

// 关闭：Esc
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && lightbox.getAttribute("aria-hidden") === "false") {
    closeLightbox();
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
