/* ============================================
   摄影作品展示网站 — 主逻辑
   ============================================ */

// ==========================================
// 0. SVG 图标集
// ==========================================
const iconSVGs = {
  instagram:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  "500px":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/></svg>',
  xiaohongshu:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h2v8H8z"/><path d="M12 8h4v4"/><circle cx="14" cy="9" r="1.5"/></svg>',
  weibo:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="4"/><circle cx="10.5" cy="8" r="1.5"/><path d="M6 15.5c1.5 2 4 3 6 3s4.5-1 6-3"/></svg>',
};

const FALLBACK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/></svg>';

// 图片加载失败占位
const ERROR_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect fill="#1c1c1e" width="400" height="300"/><text fill="#636366" x="200" y="142" text-anchor="middle" font-family="sans-serif" font-size="15">图片加载失败</text><text fill="#48484a" x="200" y="166" text-anchor="middle" font-family="sans-serif" font-size="11">请检查网络或图床连接</text></svg>'
  );

const IMAGE_LOAD_TIMEOUT = 15000;

// ==========================================
// 1. 运行时状态
// ==========================================
let photos = [];
let socialLinks = [];
let dataState = "loading"; // loading | ready | empty | error
let currentPhotoIndex = 0;

let touchStartX = 0;
let touchStartY = 0;
let touchMoved = false;

let imageLoadTimer = null;
let closeResetTimer = null;
let loadToken = 0;
let lastFocusedElement = null;

const preloadCache = new Set();

// ==========================================
// 2. DOM 引用
// ==========================================
const siteHeader = document.getElementById("header");
const siteFooter = document.getElementById("footer");
const avatarEl = document.getElementById("avatar");
const masonryEl = document.getElementById("masonry");
const footerEl = document.getElementById("footer-links");
const themeToggle = document.getElementById("theme-toggle");
const themeColorMeta = document.getElementById("theme-color");

const themeMedia = window.matchMedia
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;
const THEME_KEY = "ycamera-theme";

const lightboxEl = document.getElementById("lightbox");
const lightboxBackdrop = document.getElementById("lightbox-backdrop");
const lightboxBg = document.getElementById("lightbox-bg");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxParams = document.getElementById("lightbox-params");
const lightboxCounter = document.getElementById("lightbox-counter");
const lightboxClose = document.getElementById("lightbox-close");
const lightboxPrev = document.getElementById("lightbox-prev");
const lightboxNext = document.getElementById("lightbox-next");

const pageRegions = [siteHeader, masonryEl, siteFooter].filter(Boolean);

// ==========================================
// 3. 明暗模式
// ==========================================
function getStoredTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  const isDark = theme === "dark";

  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");

  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", isDark ? "#0b0b0c" : "#f5f5f7");
  }

  if (themeToggle) {
    const label = isDark ? "切换到浅色模式" : "切换到暗黑模式";
    themeToggle.setAttribute("aria-pressed", String(isDark));
    themeToggle.setAttribute("aria-label", label);
    themeToggle.setAttribute("title", label);
  }
}

function initTheme() {
  const current =
    document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light";

  applyTheme(current);

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const next =
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "light"
          : "dark";

      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // 隐私模式下写入失败也没关系，本次会话仍然可以切换
      }

      applyTheme(next);
    });
  }

  if (themeMedia) {
    const onSystemThemeChange = (event) => {
      // 用户手动选过主题后，不再跟随系统
      if (getStoredTheme()) return;
      applyTheme(event.matches ? "dark" : "light");
    };

    if (themeMedia.addEventListener) {
      themeMedia.addEventListener("change", onSystemThemeChange);
    } else if (themeMedia.addListener) {
      themeMedia.addListener(onSystemThemeChange);
    }
  }
}

// ==========================================
// 4. 工具函数
// ==========================================
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return character;
    }
  });
}

function asText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function asPositiveInt(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function sanitizeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value, window.location.href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.href;
  } catch {
    return "";
  }
}

function setPageInert(inert) {
  pageRegions.forEach((element) => {
    element.inert = inert;
    if (inert) {
      element.setAttribute("aria-hidden", "true");
    } else {
      element.removeAttribute("aria-hidden");
    }
  });
}

// ==========================================
// 5. 数据加载与规范化
// ==========================================
function normalizePhoto(photo, index) {
  if (!photo || typeof photo !== "object") return null;

  const thumbnail = sanitizeUrl(photo.thumbnail);
  const full = sanitizeUrl(photo.full) || thumbnail;
  if (!thumbnail || !full) return null;

  const params = photo.params && typeof photo.params === "object" ? photo.params : {};
  const exif = photo.exif && typeof photo.exif === "object" ? photo.exif : {};
  const first = (...values) => values.map(asText).find(Boolean) || "";

  return {
    id: photo.id ?? index,
    title: asText(photo.title) || "未命名作品",
    thumbnail,
    full,
    width: asPositiveInt(photo.width),
    height: asPositiveInt(photo.height),
    exif: {
      camera: first(exif.camera, params["相机"]),
      lens: first(exif.lens, params["镜头"]),
      aperture: first(exif.aperture, params["光圈"]),
      focal: first(exif.focal, params["焦段"]),
      shutter: first(exif.shutter, params["快门"]),
      iso: first(exif.iso, params["ISO"]),
      location: first(exif.location, params["地点"]),
      date: first(exif.date, params["日期"]),
    },
  };
}

function normalizeSocialLink(link) {
  if (!link || typeof link !== "object") return null;
  const url = sanitizeUrl(link.url);
  if (!url) return null;

  return {
    name: asText(link.name) || "链接",
    url,
    icon: asText(link.icon),
  };
}

async function loadData() {
  const response = await fetch("data/photos.json", { cache: "no-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = await response.json();
  if (!data || typeof data !== "object") throw new Error("数据格式错误");

  photos = (Array.isArray(data.photos) ? data.photos : [])
    .map(normalizePhoto)
    .filter(Boolean);

  socialLinks = (Array.isArray(data.socialLinks) ? data.socialLinks : [])
    .map(normalizeSocialLink)
    .filter(Boolean);
}

// ==========================================
// 6. 渲染页脚
// ==========================================
function renderFooter() {
  if (socialLinks.length === 0) {
    footerEl.innerHTML = "";
    siteFooter.hidden = true;
    return;
  }

  siteFooter.hidden = false;
  footerEl.innerHTML = socialLinks
    .map((link) => {
      const svg = Object.prototype.hasOwnProperty.call(iconSVGs, link.icon)
        ? iconSVGs[link.icon]
        : FALLBACK_ICON;
      const accessibleSvg = svg.replace(
        "<svg ",
        '<svg aria-hidden="true" focusable="false" '
      );

      return `
    <a class="footer-link" href="${escapeHtml(link.url)}" target="_blank"
       rel="noopener noreferrer" aria-label="${escapeHtml(link.name)}"
       title="${escapeHtml(link.name)}">
      ${accessibleSvg}
    </a>`;
    })
    .join("");
}

// ==========================================
// 7. 渲染瀑布流 + Scroll Reveal
// ==========================================
let masonryObserver = null;

function renderStatus(message, { retry = false, busy = false } = {}) {
  masonryEl.setAttribute("aria-busy", busy ? "true" : "false");
  masonryEl.innerHTML = `
    <div class="masonry-status">
      <p>${escapeHtml(message)}</p>
      ${retry ? '<button class="retry-button" type="button" id="retry-button">重新加载</button>' : ""}
    </div>`;
}

function markImageLoaded(img) {
  img.classList.add("loaded");
  const wrapper = img.closest(".img-wrapper");
  if (wrapper) wrapper.classList.add("loaded");
}

function markImageError(img) {
  const wrapper = img.closest(".img-wrapper");
  img.src = ERROR_PLACEHOLDER;
  img.alt = "图片加载失败";
  img.classList.add("loaded");
  if (wrapper) {
    wrapper.classList.add("loaded", "error");
  }
}

function observeMasonryItems() {
  const items = masonryEl.querySelectorAll(".masonry-item");

  if (!("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("visible"));
    return;
  }

  if (masonryObserver) masonryObserver.disconnect();

  masonryObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        masonryObserver.unobserve(entry.target);
      });
    },
    {
      threshold: 0.1,
      rootMargin: "0px 0px -30px 0px",
    }
  );

  items.forEach((item) => masonryObserver.observe(item));
}

function renderMasonry() {
  if (dataState === "loading") {
    renderStatus("照片加载中…", { busy: true });
    return;
  }

  if (dataState === "error") {
    renderStatus("照片加载失败，请检查 data/photos.json 或稍后重试。", {
      retry: true,
    });
    return;
  }

  if (photos.length === 0) {
    renderStatus("暂无照片");
    return;
  }

  masonryEl.setAttribute("aria-busy", "false");
  masonryEl.innerHTML = photos
    .map((photo, index) => {
      const dimensions =
        photo.width && photo.height
          ? ` width="${photo.width}" height="${photo.height}"`
          : "";
      const loading =
        index === 0 ? ' fetchpriority="high"' : ' loading="lazy"';

      return `
    <div class="masonry-item" data-index="${index}"
         role="button" tabindex="0"
         aria-label="${escapeHtml(`查看照片: ${photo.title}`)}">
      <div class="img-wrapper">
        <img src="${escapeHtml(photo.thumbnail)}" alt="${escapeHtml(photo.title)}"
             ${dimensions}${loading} decoding="async">
      </div>
    </div>`;
    })
    .join("");

  masonryEl.querySelectorAll(".img-wrapper img").forEach((img) => {
    const onLoad = () => markImageLoaded(img);
    const onError = () => markImageError(img);

    img.addEventListener("load", onLoad, { once: true });
    img.addEventListener("error", onError, { once: true });

    if (img.complete) {
      if (img.naturalWidth > 0) onLoad();
      else onError();
    }
  });

  observeMasonryItems();
}

// ==========================================
// 8. 灯箱逻辑
// ==========================================
function openLightbox(index) {
  const photo = photos[index];
  if (!photo || lightboxEl.classList.contains("active")) return;

  lastFocusedElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  clearTimeout(closeResetTimer);
  closeResetTimer = null;

  currentPhotoIndex = index;
  updateLightboxContent();

  lightboxEl.classList.add("active");
  lightboxEl.setAttribute("aria-hidden", "false");
  lightboxEl.setAttribute("aria-modal", "true");
  document.body.classList.add("lightbox-open");
  setPageInert(true);
  document.addEventListener("keydown", handleLightboxKeyboard);
  preloadNeighbors();
  lightboxClose.focus({ preventScroll: true });
}

function closeLightbox() {
  if (!lightboxEl.classList.contains("active")) return;

  lightboxEl.classList.remove("active");
  lightboxEl.setAttribute("aria-hidden", "true");
  lightboxEl.removeAttribute("aria-modal");
  document.body.classList.remove("lightbox-open");
  setPageInert(false);
  document.removeEventListener("keydown", handleLightboxKeyboard);

  clearImageLoadTimer();
  loadToken += 1;

  // 快速关闭再打开时，旧定时器不能清掉新图片
  clearTimeout(closeResetTimer);
  closeResetTimer = setTimeout(() => {
    lightboxImg.removeAttribute("src");
    lightboxBg.removeAttribute("src");
    lightboxImg.classList.remove("is-preview");
    lightboxBg.classList.remove("is-hidden");
  }, 450);

  if (lastFocusedElement && lastFocusedElement.isConnected) {
    lastFocusedElement.focus({ preventScroll: true });
  }
  lastFocusedElement = null;
}

function clearImageLoadTimer() {
  if (imageLoadTimer !== null) {
    clearTimeout(imageLoadTimer);
    imageLoadTimer = null;
  }
}

function preloadNeighbors() {
  [currentPhotoIndex - 1, currentPhotoIndex + 1].forEach((index) => {
    if (index < 0 || index >= photos.length) return;
    const url = photos[index].full;
    if (preloadCache.has(url)) return;

    preloadCache.add(url);
    const image = new Image();
    image.decoding = "async";
    image.src = url;
  });
}

function setLightboxImage(photo) {
  clearImageLoadTimer();
  const token = ++loadToken;
  let settled = false;

  // 先用缩略图占位，并用宽高属性预留空间，避免加载前后布局跳动
  if (photo.width && photo.height) {
    lightboxImg.width = photo.width;
    lightboxImg.height = photo.height;
  } else {
    lightboxImg.removeAttribute("width");
    lightboxImg.removeAttribute("height");
  }

  lightboxImg.classList.add("is-preview");
  lightboxImg.src = photo.thumbnail;
  lightboxImg.alt = photo.title;

  lightboxBg.src = photo.thumbnail;
  lightboxBg.classList.remove("is-hidden");

  const preloader = new Image();
  preloader.decoding = "async";

  const finish = () => {
    if (settled || token !== loadToken) return;
    settled = true;
    clearImageLoadTimer();
    lightboxImg.src = photo.full;
    lightboxImg.classList.remove("is-preview");
  };

  const fail = () => {
    if (settled || token !== loadToken) return;
    settled = true;
    clearImageLoadTimer();
    lightboxImg.classList.remove("is-preview");
    lightboxImg.width = 400;
    lightboxImg.height = 300;
    lightboxImg.src = ERROR_PLACEHOLDER;
  };

  imageLoadTimer = setTimeout(fail, IMAGE_LOAD_TIMEOUT);
  preloader.onload = finish;
  preloader.onerror = fail;
  preloader.src = photo.full;
}

function joinParamParts(parts) {
  return parts
    .filter(Boolean)
    .join('<span class="param-sep" aria-hidden="true">·</span>');
}

function updateLightboxContent() {
  const photo = photos[currentPhotoIndex];
  if (!photo) return;

  setLightboxImage(photo);
  lightboxImg.alt = photo.title;

  const { camera, lens, aperture, focal, shutter, iso, location, date } = photo.exif;

  const primary = joinParamParts([
    camera ? `<span class="param-camera">${escapeHtml(camera)}</span>` : "",
    lens ? `<span class="param-lens">${escapeHtml(lens)}</span>` : "",
    aperture ? `<span class="param-aperture">${escapeHtml(aperture)}</span>` : "",
  ]);

  const isoValue = iso.replace(/^ISO\s*/i, "");
  const secondary = joinParamParts([
    focal ? `<span class="param-focal">${escapeHtml(focal)}</span>` : "",
    isoValue ? `<span class="param-iso">ISO ${escapeHtml(isoValue)}</span>` : "",
    shutter ? `<span class="param-shutter">${escapeHtml(shutter)}</span>` : "",
  ]);

  const meta = joinParamParts([
    location ? `<span class="param-location">${escapeHtml(location)}</span>` : "",
    date ? `<span class="param-date">${escapeHtml(date)}</span>` : "",
  ]);

  lightboxParams.innerHTML = `
    <div class="photo-title">${escapeHtml(photo.title)}</div>
    ${primary ? '<div class="param-divider"></div>' : ""}
    ${primary ? `<div class="param-line primary">${primary}</div>` : ""}
    ${secondary ? `<div class="param-line secondary">${secondary}</div>` : ""}
    ${meta ? '<div class="param-divider-bottom"></div>' : ""}
    ${meta ? `<div class="param-line meta">${meta}</div>` : ""}
  `;

  lightboxCounter.textContent = `${currentPhotoIndex + 1} / ${photos.length}`;
  updateNavButtons();
}

function updateNavButtons() {
  lightboxPrev.disabled = currentPhotoIndex === 0;
  lightboxNext.disabled = currentPhotoIndex === photos.length - 1;

  // 如果当前焦点所在按钮刚被禁用，把焦点移到可用控件，避免 Tab 逃出灯箱
  if (lightboxPrev.disabled && document.activeElement === lightboxPrev) {
    (lightboxNext.disabled ? lightboxClose : lightboxNext).focus();
  }
  if (lightboxNext.disabled && document.activeElement === lightboxNext) {
    (lightboxPrev.disabled ? lightboxClose : lightboxPrev).focus();
  }
}

function navigateLightbox(direction) {
  const nextIndex = currentPhotoIndex + direction;
  if (nextIndex < 0 || nextIndex >= photos.length) return;

  currentPhotoIndex = nextIndex;
  updateLightboxContent();
  preloadNeighbors();
}

function handleLightboxKeyboard(event) {
  if (!lightboxEl.classList.contains("active")) return;

  switch (event.key) {
    case "Escape":
      event.preventDefault();
      closeLightbox();
      break;
    case "ArrowLeft":
      event.preventDefault();
      navigateLightbox(-1);
      break;
    case "ArrowRight":
      event.preventDefault();
      navigateLightbox(1);
      break;
    case "Tab": {
      const focusable = Array.from(
        lightboxEl.querySelectorAll("button:not(:disabled)")
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!lightboxEl.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
      break;
    }
    default:
      break;
  }
}

// ==========================================
// 9. 事件绑定
// ==========================================
function bindMasonryEvents() {
  masonryEl.addEventListener("click", (event) => {
    if (event.target.closest("#retry-button")) {
      initData();
      return;
    }

    const item = event.target.closest(".masonry-item");
    if (!item) return;
    openLightbox(Number(item.dataset.index));
  });

  masonryEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    const item = event.target.closest(".masonry-item");
    if (!item) return;

    event.preventDefault();
    openLightbox(Number(item.dataset.index));
  });
}

function bindLightboxEvents() {
  lightboxClose.addEventListener("click", closeLightbox);

  lightboxBackdrop.addEventListener("click", (event) => {
    if (event.target === lightboxBackdrop) closeLightbox();
  });

  lightboxPrev.addEventListener("click", () => navigateLightbox(-1));
  lightboxNext.addEventListener("click", () => navigateLightbox(1));

  // 缩略图/背景图失败时不显示破图
  lightboxImg.addEventListener("error", () => {
    if (!lightboxImg.classList.contains("is-preview")) return;
    lightboxImg.classList.remove("is-preview");
    lightboxImg.width = 400;
    lightboxImg.height = 300;
    lightboxImg.src = ERROR_PLACEHOLDER;
  });
  lightboxBg.addEventListener("error", () => {
    lightboxBg.classList.add("is-hidden");
  });

  // 触摸手势
  lightboxEl.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1) return;
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
      touchMoved = false;
    },
    { passive: true }
  );

  lightboxEl.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length !== 1) return;
      const deltaX = event.touches[0].clientX - touchStartX;
      const deltaY = event.touches[0].clientY - touchStartY;
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        touchMoved = true;
      }
    },
    { passive: true }
  );

  lightboxEl.addEventListener(
    "touchend",
    (event) => {
      if (!lightboxEl.classList.contains("active")) return;
      if (!touchMoved || event.changedTouches.length === 0) return;

      const deltaX = event.changedTouches[0].clientX - touchStartX;
      const deltaY = event.changedTouches[0].clientY - touchStartY;

      if (
        Math.abs(deltaX) > 50 &&
        Math.abs(deltaX) > Math.abs(deltaY) * 1.2
      ) {
        navigateLightbox(deltaX > 0 ? -1 : 1);
        return;
      }

      if (deltaY > 100 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
        closeLightbox();
      }
    },
    { passive: true }
  );
}

// ==========================================
// 10. 初始化
// ==========================================
async function initData() {
  dataState = "loading";
  masonryEl.setAttribute("aria-busy", "true");
  renderStatus("照片加载中…", { busy: true });

  try {
    await loadData();
    dataState = photos.length > 0 ? "ready" : "empty";
    renderFooter();
    renderMasonry();
  } catch (error) {
    console.error("加载数据失败:", error);
    photos = [];
    socialLinks = [];
    dataState = "error";
    renderFooter();
    renderMasonry();
  }
}

function init() {
  initTheme();

  if (avatarEl) {
    avatarEl.addEventListener(
      "error",
      () => avatarEl.classList.add("is-hidden"),
      { once: true }
    );
    if (avatarEl.complete && avatarEl.naturalWidth === 0) {
      avatarEl.classList.add("is-hidden");
    }
  }

  bindMasonryEvents();
  bindLightboxEvents();
  initData();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
