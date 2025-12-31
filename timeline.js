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

  async function hydrateStackCardSizes(root) {
    const tiles = Array.from(root.querySelectorAll(".event-mosaic.stack-cards .mosaic-tile.tile-img"));
    await Promise.allSettled(tiles.map(async (tile) => {
      const img = tile.querySelector("img");
      if (!img) return;

      // Ensure we have natural sizes.
      if (!img.complete || img.naturalWidth === 0) {
        try { await img.decode(); } catch { /* ignore */ }
      }
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      if (!w || !h) return;

      const ar = w / h;
      const layer = Number(tile.getAttribute("data-layer") || "0");
      const count = Math.max(1, Number(tile.getAttribute("data-count") || "1"));
      const depth = count - 1;
      const t = depth > 0 ? layer / depth : 0;

      // Size rule: keep original ratio, scale down more for extreme aspect ratios
      // and for deeper layers to create a stronger "thick stack".
      const aspectPenalty = Math.min(0.16, Math.abs(Math.log(ar)) * 0.09);
      const base = 0.94 - t * 0.10;
      const size = Math.max(0.70, Math.min(0.94, base - aspectPenalty));

      tile.style.setProperty("--ar", String(Math.round(ar * 1000) / 1000));
      tile.style.setProperty("--cardSize", String(Math.round(size * 1000) / 1000));
    }));
  }

  function hash32(str) {
    // FNV-1a
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function rand() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleInPlace(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function tileVars(layerIndex, layerCount, rnd, anchorOrder) {
    // The back-most layer is a full-cover base to ensure the composition
    // fills the whole box and touches all edges.
    const i = layerIndex;
    const backIndex = layerCount - 1;
    const depth = layerCount - 1;
    const t = depth > 0 ? i / depth : 0;

    let x = 0;
    let y = 0;
    let w = 100;
    let h = 100;

    if (i !== backIndex) {
      // Card sizes within the box.
      w = Math.round((76 + rnd() * 20) * 10) / 10; // 76..96%
      h = Math.round((76 + rnd() * 20) * 10) / 10;

      const anchor = anchorOrder[i % anchorOrder.length];
      // Anchor to edges so photo edges coincide with box edges.
      // 0: LT, 1: RT, 2: LB, 3: RB
      if (anchor === 0 || anchor === 2) x = 0;
      else x = Math.max(0, 100 - w);

      if (anchor === 0 || anchor === 1) y = 0;
      else y = Math.max(0, 100 - h);
    }

    // Depth spacing (front closer). Back base is deepest.
    const dz = Math.round(56 - i * 12);

    // Rotation + scale differences.
    const rot = (rnd() * 2 - 1) * (0.8 + t * 1.0);
    const sc = 1.02 - t * 0.12;

    // Back layers more transparent + blurrier.
    let op = Math.max(0.30, 1 - t * 0.55);
    let blur = Math.max(0, t * 3.6);
    if (i === backIndex) {
      op = Math.min(op, 0.30);
      blur = Math.max(blur, 1.8);
    }

    const zi = 100 - i;
    return `--x:${x}%;--y:${y}%;--w:${w}%;--h:${h}%;--dz:${dz}px;--rot:${rot.toFixed(2)}deg;--sc:${sc.toFixed(3)};--op:${op.toFixed(3)};--blur:${blur.toFixed(2)}px;--zi:${zi}`;
  }

  eventsEl.innerHTML = events.map((e, idx) => {
    // "is-left/is-right" means the marker (bend) hugs that edge.
    // The card is rendered on the opposite side to sit inside the bend.
    const edge = idx % 2 === 0 ? "left" : "right";
    const rnd = mulberry32(hash32(String(e.eventId || idx)));
    const totalCount = typeof e.count === "number" ? e.count : 0;

    // Cover selection rules:
    // - total > 6: pick N images, where N is a stable-random int in [3,6]
    // - 3..6: use all images
    // - < 3: use all existing images, then pad with color blocks to 3
    let desired;
    if (totalCount > 6) desired = 3 + Math.floor(rnd() * 4);
    else if (totalCount >= 3) desired = totalCount;
    else desired = 3;
    const rawKeys = Array.isArray(e.sampleKeys) ? e.sampleKeys : [];
    const keys = rawKeys.filter((k) => typeof k === "string" && k);
    const uniqueKeys = shuffleInPlace(Array.from(new Set(keys)), rnd);

    let mosaicKeys = [];
    let placeholders = 0;
    if (totalCount < 3) {
      mosaicKeys = uniqueKeys.slice(0, Math.min(uniqueKeys.length, totalCount || uniqueKeys.length));
      placeholders = Math.max(0, 3 - mosaicKeys.length);
    } else if (totalCount <= 6) {
      mosaicKeys = uniqueKeys;
      placeholders = Math.max(0, desired - mosaicKeys.length);
    } else {
      const take = Math.min(desired, uniqueKeys.length);
      mosaicKeys = uniqueKeys.slice(0, take);
      placeholders = Math.max(0, desired - mosaicKeys.length);
    }

    const mosaicImgs = mosaicKeys
      .map((k, i) => {
        const u = imgUrl(k).replace(/'/g, "%27");
        return `<span class="mosaic-tile tile-img" data-layer="${i}" data-count="${desired}" style="--tile-img:url('${u}')" aria-hidden="true"><img src="${u}" alt="" loading="lazy" decoding="async" draggable="false"></span>`;
      })
      .join("");
    const mosaicPh = Array.from({ length: placeholders })
      .map((_, i0) => {
        const hue = Math.floor(rnd() * 360);
        return `<span class="mosaic-tile mosaic-ph" style="--ph-hue:${hue}deg" aria-hidden="true"></span>`;
      })
      .join("");

    const mosaic = `
      <div class="event-mosaic stack stack-cards mosaic-${desired}" aria-hidden="true">
        ${mosaicImgs}${mosaicPh}
      </div>
    `;

    const a11yLabel = [e.title || e.eventId, e.date].filter(Boolean).join(" · ");

    const card = `
      <a class="event-card" href="timeline.html?eventId=${encodeURIComponent(e.eventId)}" aria-label="${escapeHtml(a11yLabel)}" title="${escapeHtml(a11yLabel)}">
        ${mosaic}
      </a>
    `;

    return `
      <div class="timeline-item is-${edge}">
        <div class="timeline-marker" aria-hidden="true"></div>
        ${card}
      </div>
    `;
  }).join("");

  // After DOM is painted, hydrate per-image aspect ratios for stacked covers.
  hydrateStackCardSizes(eventsEl);

  updateTimelineRail();
}

function warpPoints(points, phase, amp) {
  return points.map((p) => ({
    x: p.x + Math.sin((p.y / 90) + phase) * amp,
    y: p.y,
  }));
}

function catmullRomToBezier(points) {
  if (points.length < 2) return "";

  const path = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path.push(
      `C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`,
    );
  }
  return path.join(" ");
}

let railRaf = 0;
function updateTimelineRail() {
  const stage = document.querySelector(".timeline-stage");
  const rail = document.querySelector(".timeline-rail");
  if (!stage || !rail) return;

  // Only in list view
  if (timelineView.style.display === "none") return;

  if (railRaf) cancelAnimationFrame(railRaf);
  railRaf = requestAnimationFrame(() => {
    const stageRect = stage.getBoundingClientRect();
    const height = Math.max(260, stage.scrollHeight);
    const width = Math.max(320, Math.floor(stageRect.width));
    rail.style.height = `${height}px`;

    // rail is full-width; measure its box for x coords
    const railRect = rail.getBoundingClientRect();

    const markers = Array.from(document.querySelectorAll(".timeline-marker"));
    const points = markers.map((m) => {
      const r = m.getBoundingClientRect();
      const x = (r.left - railRect.left) + r.width / 2;
      const y = (r.top - stageRect.top) + r.height / 2;
      return { x, y };
    }).filter((p) => Number.isFinite(p.y));

    // Fallback if layout not ready
    if (points.length < 2) {
      const n = Math.max(3, Math.min(12, markers.length || 6));
      const spacing = Math.max(120, Math.floor(height / n));
      const p = [];
      for (let i = 0; i < n; i++) {
        p.push({ x: width / 2 + Math.sin(i * 0.9) * 46, y: 40 + i * spacing });
      }
      points.length = 0;
      points.push(...p);
    }

    // Add endpoints a bit beyond first/last for a more organic curve
    const first = points[0];
    const last = points[points.length - 1];
    const padded = [
      { x: first.x - 6, y: Math.max(0, first.y - 60) },
      ...points,
      { x: last.x + 10, y: last.y + 80 },
    ];

    const d = catmullRomToBezier(padded);
    const d2 = catmullRomToBezier(warpPoints(padded, 1.2, 9));
    const d3 = catmullRomToBezier(warpPoints(padded, 3.1, 14));

    rail.innerHTML = `
      <svg class="rail-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="railGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.9 0" result="g"/>
            <feMerge>
              <feMergeNode in="g"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <path class="rail-base" d="${d}" fill="none" />
        <path class="rail-mid rail-pulse" d="${d}" fill="none" />
        <path class="rail-glow" d="${d}" fill="none" filter="url(#railGlow)" />

        <path class="rail-vein rail-vein1" d="${d2}" fill="none" />
        <path class="rail-vein rail-vein2" d="${d3}" fill="none" />

        <path class="rail-flow" d="${d}" fill="none" />
      </svg>
    `;
  });
}

window.addEventListener("resize", () => updateTimelineRail());

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
  initFireflies();
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

function initFireflies() {
  const root = document.querySelector(".bg-fireflies");
  if (!root) return;

  // Keep a stable-ish look across reloads while still feeling random
  const count = 40;
  root.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const dot = document.createElement("span");

    // Base position
    const x = Math.random() * 100;
    const y = Math.random() * 100;

    // Small drift range to feel like fireflies, not big orbs
    const dx = (Math.random() * 2 - 1) * (20 + Math.random() * 40); // px
    const dy = (Math.random() * 2 - 1) * (16 + Math.random() * 36); // px

    // Size in px
    const s = 2 + Math.random() * 3.2;
    const blur = 6 + Math.random() * 14;
    const o = 0.18 + Math.random() * 0.32;

    // Timing
    const move = 6 + Math.random() * 10; // seconds
    const flicker = 1.8 + Math.random() * 2.8;
    const delay = -(Math.random() * 12);

    dot.style.setProperty("--x", `${x}%`);
    dot.style.setProperty("--y", `${y}%`);
    dot.style.setProperty("--dx", `${dx.toFixed(1)}px`);
    dot.style.setProperty("--dy", `${dy.toFixed(1)}px`);
    dot.style.setProperty("--s", `${s.toFixed(1)}px`);
    dot.style.setProperty("--b", `${blur.toFixed(1)}px`);
    dot.style.setProperty("--o", `${o.toFixed(2)}`);
    dot.style.setProperty("--move", `${move.toFixed(2)}s`);
    dot.style.setProperty("--flicker", `${flicker.toFixed(2)}s`);
    dot.style.setProperty("--delay", `${delay.toFixed(2)}s`);

    root.appendChild(dot);
  }
}
