const gallery = document.getElementById("gallery");

// 先用“静态列表”做视觉布局；
// 后续你会把这个列表改成：fetch("/api/list") 从 Worker 拉取 R2 文件列表
const PHOTOS = [
  { key: "vacation/001.jpg", desc: "描述位置（可改/可空）" },
  { key: "vacation/002.jpg", desc: "第二张照片的描述" },
  { key: "cats/mimi.png",     desc: "" },
];

// 你的图片网关（Worker）最终会长这样：
// 1) 如果你把 Worker 路由到同域名（推荐）：用相对路径 "/api/image?key=..."
// 2) 如果暂时是 workers.dev 域名：填完整 URL
const IMAGE_BASE = "/api/image?key=";

function escapeHtml(s) {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}

function render() {
  gallery.innerHTML = PHOTOS.map(p => `
    <figure class="photo">
      <img loading="lazy" src="${IMAGE_BASE}${encodeURIComponent(p.key)}" alt="${escapeHtml(p.desc)}" />
      <figcaption>${escapeHtml(p.desc)}</figcaption>
    </figure>
  `).join("");
}

render();

/** 上传弹窗占位（后续接 Worker 上传） */
const uploadBtn = document.getElementById("upload-btn");
const dialog = document.getElementById("upload-dialog");
const closeBtn = document.getElementById("close-dialog");
const fakeUpload = document.getElementById("fake-upload");

uploadBtn.onclick = () => dialog.showModal();
closeBtn.onclick = () => dialog.close();

fakeUpload.onclick = () => {
  alert("上传逻辑还没接入：下一步接 Worker 生成 presigned PUT URL → 浏览器直传 R2。");
};
