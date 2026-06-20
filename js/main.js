/* ============================================
   摄影作品展示网站 — 主逻辑
   ============================================ */

// ==========================================
// 0. SVG 图标集
// ==========================================
const iconSVGs = {
  instagram:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  // twitter:
    // '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l6.5 7.5L4 20h1.5l5.5-6.5L16.5 20H20l-7-8.5L19.5 4h-1.5L12 11 6 4z"/></svg>',
  "500px":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/></svg>',
  // github:
    // '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>',
  xiaohongshu:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h2v8H8z"/><path d="M12 8h4v4"/><circle cx="14" cy="9" r="1.5"/></svg>',
  weibo:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="4"/><circle cx="10.5" cy="8" r="1.5"/><path d="M6 15.5c1.5 2 4 3 6 3s4.5-1 6-3"/></svg>',
};

// 图片加载失败占位
const ERROR_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect fill="#1c1c1e" width="400" height="300"/><text fill="#636366" x="200" y="142" text-anchor="middle" font-family="sans-serif" font-size="15">图片加载失败</text><text fill="#48484a" x="200" y="166" text-anchor="middle" font-family="sans-serif" font-size="11">请检查网络或图床连接</text></svg>'
  );

// ==========================================
// 1. 运行时数据
// ==========================================
let photos = [];
let socialLinks = [];

// ==========================================
// 2. DOM 引用
// ==========================================
const masonryEl = document.getElementById("masonry");
const footerEl = document.getElementById("footer-links");
const lightboxEl = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxParams = document.getElementById("lightbox-params");
const lightboxCounter = document.getElementById("lightbox-counter");
const lightboxClose = document.getElementById("lightbox-close");
const lightboxPrev = document.getElementById("lightbox-prev");
const lightboxNext = document.getElementById("lightbox-next");
const lightboxBackdrop = document.querySelector(".lightbox-backdrop");

let currentPhotoIndex = 0;
let touchStartX = 0;
let touchStartY = 0;
let touchMoved = false;

// 图片加载超时
let imageLoadTimer = null;
const IMAGE_LOAD_TIMEOUT = 15000;

// 图片预加载缓存
const preloadCache = new Set();
const preloader = document.createElement("img");
preloader.style.display = "none";
document.body.appendChild(preloader);

// ==========================================
// 3. 参数映射（中文 key → 布局位置）
// ==========================================
const PARAM_KEY_MAP = {
  相机: "camera",
  光圈: "aperture",
  焦段: "focal",
  快门: "shutter",
  ISO: "iso",
  地点: "location",
  日期: "date",
};

function getParam(params, key) {
  return params[key] || "";
}

// ==========================================
// 4. 数据加载
// ==========================================
async function loadData() {
  try {
    const resp = await fetch("data/photos.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    photos = data.photos || [];
    socialLinks = data.socialLinks || [];
  } catch (err) {
    console.error("加载数据失败:", err);
    photos = [];
    socialLinks = [];
  }
}

// ==========================================
// 5. 渲染页脚
// ==========================================
function renderFooter() {
  footerEl.innerHTML = socialLinks
    .map((link) => {
      const svg =
        iconSVGs[link.icon] ||
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/></svg>';
      return `
    <a class="footer-link" href="${link.url}" target="_blank"
       rel="noopener noreferrer" aria-label="${link.name}" title="${link.name}">
      ${svg}
    </a>`;
    })
    .join("");
}

// ==========================================
// 6. 渲染瀑布流 + Scroll Reveal
// ==========================================
function renderMasonry() {
  if (photos.length === 0) {
    masonryEl.innerHTML =
      '<p style="text-align:center;color:var(--text-secondary);padding:80px 0;grid-column:1/-1;font-size:15px;">暂无照片</p>';
    return;
  }

  masonryEl.innerHTML = photos
    .map(
      (photo, index) => `
    <div class="masonry-item" data-index="${index}"
         role="button" tabindex="0"
         aria-label="查看照片: ${photo.title}">
      <div class="img-wrapper">
        <img src="${photo.thumbnail}" alt="${photo.title}"
             loading="lazy" data-index="${index}">
      </div>
    </div>`
    )
    .join("");

  // --- 图片加载完成 → 隐藏骨架屏、触发绽放 ---
  masonryEl.querySelectorAll("img").forEach((img) => {
    img.addEventListener("load", () => {
      img.classList.add("loaded");
      const wrapper = img.closest(".img-wrapper");
      if (wrapper) wrapper.classList.add("loaded");
    });
    // 如果图片已经被缓存并立即加载
    if (img.complete && img.naturalWidth > 0) {
      img.classList.add("loaded");
      const wrapper = img.closest(".img-wrapper");
      if (wrapper) wrapper.classList.add("loaded");
    }
  });

  // --- IntersectionObserver 滚动入场 ---
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: "0px 0px -30px 0px",
    }
  );

  masonryEl.querySelectorAll(".masonry-item").forEach((item) => {
    observer.observe(item);
  });

  // --- 事件委托 ---
  masonryEl.addEventListener("click", (e) => {
    const item = e.target.closest(".masonry-item");
    if (!item) return;
    openLightbox(parseInt(item.dataset.index, 10));
  });

  masonryEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const item = e.target.closest(".masonry-item");
    if (!item) return;
    e.preventDefault();
    openLightbox(parseInt(item.dataset.index, 10));
  });
}

// ==========================================
// 7. 灯箱逻辑
// ==========================================
function openLightbox(index) {
  currentPhotoIndex = index;
  preloadNeighbors();
  updateLightboxContent();
  lightboxEl.classList.add("active");
  lightboxEl.setAttribute("aria-hidden", "false");
  document.body.classList.add("lightbox-open");
  document.addEventListener("keydown", handleLightboxKeyboard);
}

function closeLightbox() {
  lightboxEl.classList.remove("active");
  lightboxEl.setAttribute("aria-hidden", "true");
  document.body.classList.remove("lightbox-open");
  document.removeEventListener("keydown", handleLightboxKeyboard);
  clearImageLoadTimer();
  setTimeout(() => {
    lightboxImg.src = "";
  }, 450);
}

// --- 预加载前后图片 ---
function preloadNeighbors() {
  [currentPhotoIndex - 1, currentPhotoIndex + 1].forEach((i) => {
    if (i < 0 || i >= photos.length) return;
    const url = photos[i].full;
    if (preloadCache.has(url)) return;
    preloadCache.add(url);
    // 使用临时 Image 对象预加载
    const tmp = new Image();
    tmp.src = url;
  });
}

// --- 图片加载与超时 ---
function setLightboxImage(url) {
  clearImageLoadTimer();
  lightboxImg.classList.add("switching");
  lightboxImg.src = url;

  imageLoadTimer = setTimeout(() => {
    if (!lightboxImg.complete || lightboxImg.naturalWidth === 0) {
      lightboxImg.src = ERROR_PLACEHOLDER;
      lightboxImg.classList.remove("switching");
    }
  }, IMAGE_LOAD_TIMEOUT);
}

function clearImageLoadTimer() {
  if (imageLoadTimer !== null) {
    clearTimeout(imageLoadTimer);
    imageLoadTimer = null;
  }
}

// --- 更新灯箱内容（编辑排版参数面板） ---
function updateLightboxContent() {
  const photo = photos[currentPhotoIndex];
  if (!photo) return;

  setLightboxImage(photo.full);
  lightboxImg.alt = photo.title;

  const p = photo.params;
  const camera = getParam(p, "相机");
  const aperture = getParam(p, "光圈");
  const focal = getParam(p, "焦段");
  const shutter = getParam(p, "快门");
  const iso = getParam(p, "ISO");
  const location = getParam(p, "地点");
  const date = getParam(p, "日期");

  // 编辑排版风格的参数面板
  lightboxParams.innerHTML = `
    <div class="photo-title">${photo.title}</div>
    <div class="param-divider"></div>
    <div class="param-line primary">
      ${camera ? `<span class="param-camera">${camera}</span>` : ""}
      ${camera && aperture ? `<span class="param-sep">·</span>` : ""}
      ${aperture ? `<span class="param-aperture">${aperture}</span>` : ""}
    </div>
    <div class="param-line secondary">
      ${focal ? `<span class="param-focal">${focal}</span>` : ""}
      ${focal && iso ? `<span class="param-sep">·</span>` : ""}
      ${iso ? `<span class="param-iso">ISO ${iso}</span>` : ""}
      ${(focal || iso) && shutter ? `<span class="param-sep">·</span>` : ""}
      ${shutter ? `<span class="param-shutter">${shutter}</span>` : ""}
    </div>
    <div class="param-divider-bottom"></div>
    <div class="param-line meta">
      ${location ? `<span class="param-location">${location}</span>` : ""}
      ${location && date ? `<span class="param-sep">·</span>` : ""}
      ${date ? `<span class="param-date">${date}</span>` : ""}
    </div>
  `;

  lightboxCounter.textContent = `${currentPhotoIndex + 1} / ${photos.length}`;
  updateNavButtons();
}

function updateNavButtons() {
  lightboxPrev.style.opacity = currentPhotoIndex === 0 ? "0.25" : "1";
  lightboxPrev.style.pointerEvents = currentPhotoIndex === 0 ? "none" : "auto";

  lightboxNext.style.opacity =
    currentPhotoIndex === photos.length - 1 ? "0.25" : "1";
  lightboxNext.style.pointerEvents =
    currentPhotoIndex === photos.length - 1 ? "none" : "auto";
}

function navigateLightbox(direction) {
  const newIndex = currentPhotoIndex + direction;
  if (newIndex < 0 || newIndex >= photos.length) return;
  currentPhotoIndex = newIndex;
  preloadNeighbors();
  updateLightboxContent();
}

function handleLightboxKeyboard(e) {
  switch (e.key) {
    case "Escape":
      e.preventDefault();
      closeLightbox();
      break;
    case "ArrowLeft":
      e.preventDefault();
      navigateLightbox(-1);
      break;
    case "ArrowRight":
      e.preventDefault();
      navigateLightbox(1);
      break;
  }
}

// ==========================================
// 8. 灯箱事件绑定
// ==========================================
lightboxClose.addEventListener("click", closeLightbox);

lightboxBackdrop.addEventListener("click", (e) => {
  if (e.target === lightboxBackdrop) closeLightbox();
});

lightboxPrev.addEventListener("click", () => navigateLightbox(-1));
lightboxNext.addEventListener("click", () => navigateLightbox(1));

// ==========================================
// 9. 触摸手势
// ==========================================
lightboxEl.addEventListener("touchstart", (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchMoved = false;
}, { passive: true });

lightboxEl.addEventListener("touchmove", (e) => {
  touchMoved = true;
}, { passive: true });

lightboxEl.addEventListener("touchend", (e) => {
  if (!lightboxEl.classList.contains("active")) return;
  if (!touchMoved) return;

  const deltaX = e.changedTouches[0].clientX - touchStartX;
  const deltaY = e.changedTouches[0].clientY - touchStartY;

  if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
    navigateLightbox(deltaX > 0 ? -1 : 1);
  }

  if (deltaY > 100 && Math.abs(deltaY) > Math.abs(deltaX)) {
    closeLightbox();
  }
});

// ==========================================
// 10. 图片事件
// ==========================================
lightboxImg.addEventListener("load", () => {
  clearImageLoadTimer();
  lightboxImg.classList.remove("switching");
});

lightboxImg.addEventListener("error", () => {
  // 等待超时计时器到期后统一处理
});

// ==========================================
// 11. 初始化
// ==========================================
async function init() {
  await loadData();
  renderFooter();
  renderMasonry();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
