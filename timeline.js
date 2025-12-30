const IMAGE_BASE = "/api/img?key=";
const MAX_BATCH = 30;

function imgUrl(key) {
  if (IMAGE_BASE.includes("?key=")) return `${IMAGE_BASE}${encodeURIComponent(key)}`;
  return `${IMAGE_BASE}${key}`;
}

function escapeHtml(s) {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function qs(id) {
  return document.getElementById(id);
}

function getEventIdFromUrl() {
  const url = new URL(window.location.href);
  const eventId = url.searchParams.get("eventId");
  return eventId || "";
}

async function jsonFetch(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

/* -------------------- Timeline list -------------------- */
const timelineView = qs("timeline-view");
const eventView = qs("event-view");
const eventsEl = qs("events");
const emptyEl = qs("events-empty");

async function loadEvents() {
  const data = await jsonFetch("/api/events", { cache: "no-store" });
  const events = data.events || [];

  if (events.length === 0) {
    eventsEl.innerHTML = "";
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";

  eventsEl.innerHTML = events.map((e) => {
    const cover = e.coverKey
      ? `<img class="event-cover" loading="lazy" src="${imgUrl(e.coverKey)}" alt="" />`
      : `<div class="event-cover placeholder"></div>`;

    const meta = [e.date, typeof e.count === "number" ? `${e.count} 张` : ""]
      .filter(Boolean)
      .join(" · ");

    const note = e.note ? `<div class="event-note">${escapeHtml(e.note)}</div>` : "";

    return `
      <a class="event-card" href="timeline.html?eventId=${encodeURIComponent(e.eventId)}">
        ${cover}
        <div class="event-info">
          <div class="event-card-title">${escapeHtml(e.title || e.eventId)}</div>
          <div class="event-card-meta">${escapeHtml(meta)}</div>
          ${note}
        </div>
      </a>
    `;
  }).join("");
}

/* -------------------- Create event -------------------- */
const newEventBtn = qs("new-event-btn");
const createDialog = qs("create-dialog");
const createClose = qs("create-close");
const createTitle = qs("create-title");
const createDate = qs("create-date");
const createNote = qs("create-note");
const createSubmit = qs("create-submit");

newEventBtn.addEventListener("click", () => {
  // default date to today
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  createDate.value = `${yyyy}-${mm}-${dd}`;

  createDialog.showModal();
  createTitle.focus();
});

createClose.addEventListener("click", () => createDialog.close());

createSubmit.addEventListener("click", async () => {
  const title = (createTitle.value || "").trim();
  const date = (createDate.value || "").trim();
  const note = (createNote.value || "").trim();

  if (!title) return alert("请填写标题");
  if (!date) return alert("请填写日期");

  createSubmit.disabled = true;
  const original = createSubmit.textContent;
  createSubmit.textContent = "创建中...";

  try {
    const data = await jsonFetch("/api/event-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, date, note }),
    });

    createDialog.close();
    createTitle.value = "";
    createNote.value = "";

    window.location.href = `timeline.html?eventId=${encodeURIComponent(data.eventId)}`;
  } catch (e) {
    alert(e.message || String(e));
  } finally {
    createSubmit.disabled = false;
    createSubmit.textContent = original || "创建";
  }
});

/* -------------------- Event view (gallery + upload) -------------------- */
const pageTitle = qs("page-title");
const pageSubtitle = qs("page-subtitle");
const eventTitleEl = qs("event-title");
const eventMetaEl = qs("event-meta");
const eventUploadBtn = qs("event-upload-btn");
const deleteEventBtn = qs("delete-event-btn");

const gallery = qs("gallery");
const lightbox = qs("lightbox");
const lightboxImg = qs("lightbox-img");
const lightboxCaption = qs("lightbox-caption");

let PHOTOS = []; // [{ key, desc }]
let currentIndex = -1;

function isLightboxOpen() {
  return lightbox.getAttribute("aria-hidden") === "false";
}

function setLightboxContent(idx) {
  currentIndex = idx;
  const photo = PHOTOS[currentIndex];
  lightboxImg.src = imgUrl(photo.key);
  lightboxImg.alt = "";
  lightboxCaption.textContent = photo.desc || "";
}

function openLightbox(idx) {
  setLightboxContent(idx);
  lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImg.src = "";
  document.body.style.overflow = "";
  currentIndex = -1;
}

function showNext() {
  if (!isLightboxOpen() || PHOTOS.length === 0) return;
  const next = (currentIndex + 1) % PHOTOS.length;
  setLightboxContent(next);
}

function showPrev() {
  if (!isLightboxOpen() || PHOTOS.length === 0) return;
  const prev = (currentIndex - 1 + PHOTOS.length) % PHOTOS.length;
  setLightboxContent(prev);
}

function renderGallery() {
  gallery.innerHTML = PHOTOS.map((p, idx) => `
    <figure class="photo" data-idx="${idx}">
      <img loading="lazy" src="${imgUrl(p.key)}" alt="" />
    </figure>
  `).join("");
}

gallery.addEventListener("click", (e) => {
  const card = e.target.closest(".photo");
  if (!card) return;
  const idx = Number(card.dataset.idx);
  if (Number.isNaN(idx)) return;
  openLightbox(idx);
});

lightbox.addEventListener("click", (e) => {
  if (e.target?.closest?.('[data-close="1"]')) closeLightbox();
});

window.addEventListener("keydown", (e) => {
  if (!isLightboxOpen()) return;

  if (e.key === "Escape") return closeLightbox();
  if (e.key === "ArrowRight") { e.preventDefault(); return showNext(); }
  if (e.key === "ArrowLeft")  { e.preventDefault(); return showPrev(); }
});

async function loadEvent(eventId) {
  const manifest = await jsonFetch(`/api/event?eventId=${encodeURIComponent(eventId)}`, { cache: "no-store" });

  const title = typeof manifest?.title === "string" ? manifest.title : eventId;
  const date = typeof manifest?.date === "string" ? manifest.date : "";
  const note = typeof manifest?.note === "string" ? manifest.note : "";

  eventTitleEl.textContent = title;
  eventMetaEl.textContent = [date, note].filter(Boolean).join(" · ");

  const photos = Array.isArray(manifest?.photos) ? manifest.photos : [];
  PHOTOS = photos.map((p) => {
    const file = typeof p?.file === "string" ? p.file : "";
    const desc = typeof p?.desc === "string" ? p.desc : "";
    return { key: `events/${eventId}/${file}`, desc };
  }).filter((p) => p.key && !p.key.endsWith("/"));

  renderGallery();
}

async function deleteEvent(eventId) {
  const ok1 = window.confirm("确定要删除这个事件吗？这会删除事件下的所有照片（不可恢复）。");
  if (!ok1) return;
  const ok2 = window.confirm("再次确认：真的要彻底删除吗？");
  if (!ok2) return;

  deleteEventBtn.disabled = true;
  const original = deleteEventBtn.textContent;
  deleteEventBtn.textContent = "删除中...";

  try {
    await jsonFetch("/api/event-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, force: true }),
    });

    window.location.href = "timeline.html";
  } catch (e) {
    alert(e.message || String(e));
  } finally {
    deleteEventBtn.disabled = false;
    deleteEventBtn.textContent = original || "删除事件";
  }
}

// Event upload
const uploadDialog = qs("upload-dialog");
const uploadClose = qs("upload-close");
const fileInput = qs("file-input");
const descInput = qs("desc-input");
const doUpload = qs("do-upload");

uploadClose.addEventListener("click", () => uploadDialog.close());

eventUploadBtn.addEventListener("click", () => uploadDialog.showModal());

doUpload.addEventListener("click", async () => {
  const eventId = getEventIdFromUrl();
  const files = Array.from(fileInput?.files || []);
  const desc = (descInput?.value || "").trim();

  if (!eventId) return alert("缺少 eventId");
  if (files.length === 0) return alert("请选择图片");
  if (files.length > MAX_BATCH) {
    return alert(`一次最多上传 ${MAX_BATCH} 张图片，请分批上传（当前选择：${files.length} 张）`);
  }
  if (files.some((f) => !f.type?.startsWith("image/"))) {
    return alert("只能上传图片文件");
  }

  doUpload.disabled = true;
  const original = doUpload.textContent;

  try {
    for (let i = 0; i < files.length; i++) {
      doUpload.textContent = `上传中... (${i + 1}/${files.length})`;

      const fd = new FormData();
      fd.append("eventId", eventId);
      fd.append("file", files[i]);
      fd.append("desc", desc);

      const res = await fetch("/api/event-upload", { method: "POST", body: fd });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        const name = files[i]?.name ? `\n文件：${files[i].name}` : "";
        throw new Error((t || `上传失败: ${res.status}`) + name);
      }
    }

    fileInput.value = "";
    if (descInput) descInput.value = "";
    uploadDialog.close();

    await loadEvent(eventId);
  } catch (e) {
    alert(e.message || String(e));
  } finally {
    doUpload.disabled = false;
    doUpload.textContent = original || "上传";
  }
});

/* -------------------- Bootstrap -------------------- */
(async function init() {
  const eventId = getEventIdFromUrl();

  if (!eventId) {
    pageTitle.textContent = "Timeline";
    pageSubtitle.textContent = "按事件管理照片";
    timelineView.style.display = "block";
    eventView.style.display = "none";
    eventUploadBtn.style.display = "none";
    deleteEventBtn.style.display = "none";
    await loadEvents();
    return;
  }

  pageTitle.textContent = "事件";
  pageSubtitle.textContent = "";
  timelineView.style.display = "none";
  eventView.style.display = "block";
  eventUploadBtn.style.display = "inline-flex";
  deleteEventBtn.style.display = "inline-flex";
  deleteEventBtn.onclick = () => deleteEvent(eventId);

  await loadEvent(eventId);
})();
