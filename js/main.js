/* ============================================
   摄影作品展示网站 — 主逻辑
   ============================================ */

// ==========================================
// 0. SVG 图标集
// ==========================================
const iconSVGs = {
  instagram:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  twitter:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l6.5 7.5L4 20h1.5l5.5-6.5L16.5 20H20l-7-8.5L19.5 4h-1.5L12 11 6 4z"/></svg>',
  "500px":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/></svg>',
  github:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>',
};

// 图片加载失败占位图
const ERROR_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect fill="#2c2c2e" width="400" height="300"/><text fill="#86868b" x="200" y="145" text-anchor="middle" font-family="sans-serif" font-size="16">图片加载失败</text><text fill="#aeaeb2" x="200" y="170" text-anchor="middle" font-family="sans-serif" font-size="12">请检查网络或图床连接</text></svg>'
  );

// ==========================================
// 1. 运行时数据（从 JSON 加载）
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

// 图片加载超时控制
let imageLoadTimer = null;
const IMAGE_LOAD_TIMEOUT = 15000; // 15 秒超时

// ==========================================
// 3. 数据加载
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
    // 降级：空数组，页面显示空状态
    photos = [];
    socialLinks = [];
  }
}

// ==========================================
// 4. 渲染页脚
// ==========================================
function renderFooter() {
  footerEl.innerHTML = socialLinks
    .map((link) => {
      const svg =
        iconSVGs[link.icon] ||
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/></svg>';
      return `
    <a
      class="footer-link"
      href="${link.url}"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="${link.name}"
      title="${link.name}"
    >
      ${svg}
    </a>
  `;
    })
    .join("");
}

// ==========================================
// 5. 渲染瀑布流
// ==========================================
function renderMasonry() {
  if (photos.length === 0) {
    masonryEl.innerHTML =
      '<p style="grid-column:1/-1;text-align:center;color:var(--text-secondary);padding:60px 0;">暂无照片</p>';
    return;
  }

  masonryEl.innerHTML = photos
    .map(
      (photo, index) => `
    <div
      class="masonry-item"
      data-index="${index}"
      style="animation-delay: ${index * 0.05}s"
      role="button"
      tabindex="0"
      aria-label="查看照片: ${photo.title}"
    >
      <img
        src="${photo.thumbnail}"
        alt="${photo.title}"
        loading="lazy"
        data-index="${index}"
      >
    </div>
  `
    )
    .join("");

  // 事件委托：点击卡片打开灯箱
  masonryEl.addEventListener("click", (e) => {
    const item = e.target.closest(".masonry-item");
    if (!item) return;
    const index = parseInt(item.dataset.index, 10);
    openLightbox(index);
  });

  // 键盘无障碍
  masonryEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const item = e.target.closest(".masonry-item");
    if (!item) return;
    e.preventDefault();
    const index = parseInt(item.dataset.index, 10);
    openLightbox(index);
  });
}

// ==========================================
// 6. 灯箱逻辑
// ==========================================
function openLightbox(index) {
  currentPhotoIndex = index;
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
  // 延迟清除图片，避免过渡闪烁
  setTimeout(() => {
    lightboxImg.src = "";
  }, 400);
}

function setLightboxImage(url) {
  // 清除之前的超时计时器
  clearImageLoadTimer();

  // 设置图片源
  lightboxImg.src = url;

  // 启动 15 秒加载超时 —— 超时后才显示加载失败
  imageLoadTimer = setTimeout(() => {
    // 检查图片是否已经成功加载
    if (!lightboxImg.complete || lightboxImg.naturalWidth === 0) {
      lightboxImg.src = ERROR_PLACEHOLDER;
    }
  }, IMAGE_LOAD_TIMEOUT);
}

function clearImageLoadTimer() {
  if (imageLoadTimer !== null) {
    clearTimeout(imageLoadTimer);
    imageLoadTimer = null;
  }
}

function updateLightboxContent() {
  const photo = photos[currentPhotoIndex];
  if (!photo) return;

  // 设置图片（含超时控制）
  setLightboxImage(photo.full);
  lightboxImg.alt = photo.title;

  // 更新参数面板
  const params = photo.params;
  const paramKeys = Object.keys(params);

  lightboxParams.innerHTML = `
    <div class="photo-title">${photo.title}</div>
    ${paramKeys
      .map(
        (key) => `
      <div class="param-item">
        <span class="param-label">${key}</span>
        <span class="param-value">${params[key]}</span>
      </div>
    `
      )
      .join("")}
  `;

  // 更新计数器
  lightboxCounter.textContent = `${currentPhotoIndex + 1} / ${photos.length}`;

  // 更新导航按钮状态
  updateNavButtons();
}

function updateNavButtons() {
  lightboxPrev.style.opacity = currentPhotoIndex === 0 ? "0.3" : "1";
  lightboxPrev.style.pointerEvents = currentPhotoIndex === 0 ? "none" : "auto";

  lightboxNext.style.opacity =
    currentPhotoIndex === photos.length - 1 ? "0.3" : "1";
  lightboxNext.style.pointerEvents =
    currentPhotoIndex === photos.length - 1 ? "none" : "auto";
}

function navigateLightbox(direction) {
  const newIndex = currentPhotoIndex + direction;
  if (newIndex < 0 || newIndex >= photos.length) return;
  currentPhotoIndex = newIndex;
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
// 7. 灯箱事件绑定
// ==========================================
lightboxClose.addEventListener("click", closeLightbox);

lightboxBackdrop.addEventListener("click", (e) => {
  // 只点击背景区域才关闭，点击内容区不关闭
  if (e.target === lightboxBackdrop) {
    closeLightbox();
  }
});

lightboxPrev.addEventListener("click", () => navigateLightbox(-1));
lightboxNext.addEventListener("click", () => navigateLightbox(1));

// ==========================================
// 8. 触摸手势支持
// ==========================================
lightboxEl.addEventListener(
  "touchstart",
  (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchMoved = false;
  },
  { passive: true }
);

lightboxEl.addEventListener(
  "touchmove",
  (e) => {
    if (!touchMoved) {
      touchMoved = true;
    }
  },
  { passive: true }
);

lightboxEl.addEventListener("touchend", (e) => {
  if (!lightboxEl.classList.contains("active")) return;
  if (!touchMoved) return;

  const deltaX = e.changedTouches[0].clientX - touchStartX;
  const deltaY = e.changedTouches[0].clientY - touchStartY;

  // 水平滑动 > 50px 且大于垂直滑动
  if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
    if (deltaX > 0) {
      navigateLightbox(-1);
    } else {
      navigateLightbox(1);
    }
  }

  // 向下滑动 > 100px 关闭灯箱
  if (deltaY > 100 && Math.abs(deltaY) > Math.abs(deltaX)) {
    closeLightbox();
  }
});

// ==========================================
// 9. 图片加载事件
// ==========================================
lightboxImg.addEventListener("load", () => {
  // 图片加载成功，清除超时计时器
  clearImageLoadTimer();
});

lightboxImg.addEventListener("error", () => {
  // 不立即显示错误 —— 等待超时计时器到期后再判断
  // 超时计时器在 setLightboxImage() 中已启动
  // 如果超时后仍未加载成功，才会显示错误占位图
});

// ==========================================
// 10. 页面初始化
// ==========================================
async function init() {
  await loadData();
  renderFooter();
  renderMasonry();
}

// DOM 加载完成后初始化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
