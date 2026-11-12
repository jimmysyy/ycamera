# Photography — 摄影作品展示网站

苹果极简风格的个人摄影作品集。纯静态站点，图片在本地压缩后上传到 Cloudflare R2，网站部署在 Cloudflare Pages。

- 瀑布流照片墙 + 毛玻璃灯箱
- 当前作品的模糊副本作为灯箱背景
- 自动读取 EXIF（相机、镜头、光圈、快门、ISO、焦段、GPS、日期）
- 本地图片压缩脚本，原图不会进入 GitHub 或 Cloudflare Pages
- 明暗模式，首次跟随系统，手动切换后记住选择

---

## 目录

- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [图片工作流](#图片工作流)
- [EXIF 自动读取](#exif-自动读取)
- [明暗模式](#明暗模式)
- [自定义内容](#自定义内容)
- [文件结构](#文件结构)
- [部署](#部署)
- [性能与缓存](#性能与缓存)
- [已知限制](#已知限制)
- [常见问题](#常见问题)

---

## 功能特性

### 展示

- **瀑布流**：5 / 4 / 3 / 2 列自适应，使用 CSS 多列布局。
- **固定玻璃页眉/页脚**：滚动时照片从毛玻璃下方经过。
- **灯箱**：
  - 当前作品的缩略图放大后作为背景，并做模糊 + 压暗处理；
  - 长屏端参数在右侧，竖屏端参数在图片下方；
  - 关闭按钮、上一张/下一张、照片计数器；
  - 支持键盘方向键、`Esc`、左右滑动、下滑关闭。
- **渐进加载**：先用已缓存的缩略图占位，高清图加载完成后无缝替换，避免点开后空白。
- **图片失败兜底**：缩略图/大图加载失败都会显示占位图，不会无限闪烁骨架屏。

### 交互与可访问性

- 灯箱打开时焦点进入关闭按钮，`Tab` 在灯箱内循环，关闭后焦点返回原卡片。
- 背景使用 `inert` + `aria-hidden`，避免键盘和读屏用户走到遮罩后面。
- 照片卡片支持 `Enter` / `Space` 打开。
- 计数器带 `aria-live`，切图时读屏可播报。
- 支持 `prefers-reduced-motion`。
- iPhone 安全区适配：`env(safe-area-inset-*)`、`100dvh`、`viewport-fit=cover`。
- 图片加载前预留宽高，减少瀑布流布局跳动（CLS）。

### 主题

- 右上角太阳/月亮按钮切换明暗模式。
- 首次访问跟随系统 `prefers-color-scheme`。
- 手动切换后写入 `localStorage`，下次访问保持。
- `js/theme-init.js` 在首屏渲染前应用主题，避免刷新时闪白。
- 浏览器地址栏颜色通过 `theme-color` 同步更新。

### 图片与性能

- 本地脚本自动压缩：大图最长边 2048，缩略图最长边 800，输出 WebP。
- 自动读取 EXIF，并写入 `data/photos.json`。
- 图片路径、宽高、EXIF 由脚本统一生成，减少手写出错。
- 首图 `fetchpriority="high"`，其余 `loading="lazy"` + `decoding="async"`。
- 构建产物只包含网站运行文件，不包含原图和压缩图。
- 提供 Cloudflare Pages `_headers`（缓存 + CSP + 安全头）。

---

## 快速开始

```bash
npm install     # 安装图片脚本依赖 sharp / exifr
npm run dev     # http://localhost:8080
```

网站本身不需要构建即可预览；`npm install` 主要是为了图片处理脚本。

---

## 图片工作流

### 1. 放入原图

把相机原图放进：

```text
photos/originals/
```

支持 JPG / JPEG / PNG / TIFF / WebP / AVIF。支持子目录，输出会保留相对路径：

```text
photos/originals/2025/shuizu.jpg
  → photos/large/2025/shuizu.webp
  → photos/thumbs/2025/shuizu.webp
```

HEIC/HEIF 依赖 sharp 的编译选项，不保证可用，建议先转成 JPEG。

> **迁移当前这张照片**：`data/photos.json` 目前仍指向旧的 R2 地址
> `shuizu.webp` / `shuizu-full.webp`。把原图放进
> `photos/originals/shuizu.webp`，运行 `npm run photos`，再把新生成的
> `photos/thumbs/` 和 `photos/large/` 上传到 R2，即可切换到压缩版本。
> `data/photo-overrides.json` 里已经保留了这张图的标题和地点信息。

### 2. 运行处理脚本

```bash
npm run photos
```

脚本会：

1. 按 EXIF `Orientation` 自动摆正；
2. 生成灯箱大图到 `photos/large/`；
3. 生成瀑布流缩略图到 `photos/thumbs/`；
4. 读取 EXIF；
5. 更新 `data/photos.json`；
6. 生成 `photos/manifest.json`（本地清单，已被 Git 忽略）。

输出规格：

| 目录 | 最长边 | 格式 | 质量 | 用途 |
|---|---:|---|---:|---|
| `photos/large/` | 2048 | WebP | 82 | 灯箱大图 |
| `photos/thumbs/` | 800 | WebP | 74 | 瀑布流缩略图 |

脚本是增量的：原图没有变化时不会重复压缩。修改了压缩参数后，用 `--force`。

### 3. 上传到 R2

把两个输出目录分别上传到 R2 对应的前缀：

```text
photos/large/   → R2: large/
photos/thumbs/  → R2: thumbs/
```

网站通过以下地址访问：

```text
https://p.yjimmy.cn/large/<路径>.webp
https://p.yjimmy.cn/thumbs/<路径>.webp
```

如果 R2 自定义域名不是 `p.yjimmy.cn`，修改：

- `scripts/process-photos.mjs` 里的 `CONFIG.baseUrl`；
- `_headers` 里的 CSP `img-src`；
- 也可以每次运行时传 `--base-url`。

### 4. 构建并部署

```bash
npm run build
```

构建产物在 `dist/`，只包含：

```text
index.html  css/  js/  data/  images/  _headers  robots.txt
```

**不会包含** `photos/`、`scripts/`、`node_modules/`，所以原图和压缩图不会占用 Cloudflare Pages 空间。

### 命令速查

| 命令 | 作用 |
|---|---|
| `npm run dev` | 本地预览（Python 静态服务器，端口 8080） |
| `npm run photos` | 增量压缩 + 读取 EXIF + 更新 `data/photos.json` |
| `npm run photos:force` | 强制全部重新压缩 |
| `npm run photos -- --no-data` | 只压图，不修改 JSON |
| `npm run photos -- --prune` | 删除没有原图对应的旧输出 |
| `npm run photos -- --base-url https://cdn.example.com` | 临时指定 R2 域名 |
| `npm run build` | 生成 `dist/` 部署目录 |

---

## EXIF 自动读取

### 支持的字段

| 网站字段 | EXIF 来源 | 示例 |
|---|---|---|
| 相机 | `Make` + `Model`（自动去重） | `Canon EOS R5` |
| 镜头 | `LensModel` / `Lens` | `RF14-35mm F4 L IS USM` |
| 光圈 | `FNumber` | `f/2.8` |
| 快门 | `ExposureTime` | `1/160s`、`30s` |
| ISO | `ISO` / `ISOSpeedRatings` | `ISO 3200` |
| 焦段 | `FocalLength` | `14mm` |
| 日期 | `DateTimeOriginal` / `CreateDate` | `2025-01-20` |
| 地点 | GPS 经纬度 | `31.2304°N, 121.4737°E` |

JPEG 使用 `exifr` 解析；WebP 等 exifr 不支持的格式会自动回退到 `sharp` + `exif-reader`，两种路径都已实测可用。

输出的 WebP 不保留 EXIF，避免隐私信息和体积；EXIF 已经写入 `data/photos.json`。

### 手动补充/覆盖

GPS 只能给出坐标，不能反查地名；有些软件也会剥离 EXIF。此时编辑：

```text
data/photo-overrides.json
```

key 可以是文件名，也可以是相对路径：

```json
{
  "2025/shuizu.webp": {
    "title": "水竹新生",
    "camera": "Canon R5",
    "lens": "RF14-35mm F4 L IS USM",
    "aperture": "f/2.8",
    "focal": "14mm",
    "shutter": "30s",
    "iso": "3200",
    "location": "内蒙古",
    "date": "2025-01-20",
    "order": 13
  }
}
```

可用字段：

| 字段 | 说明 |
|---|---|
| `title` | 标题，默认从文件名推导 |
| `camera` / `lens` / `aperture` / `focal` / `shutter` / `iso` / `location` / `date` | 覆盖自动读取的 EXIF |
| `order` | 排序，数字越小越靠前；不写则按文件名自然排序 |
| `hidden` | 设为 `true` 跳过这张图（配合 `--prune` 清理旧输出） |
| `id` | 自定义 id，一般不需要 |

文件名开头的数字也会参与排序，例如 `01-xxx.jpg`、`02-xxx.jpg`。标题会去掉开头数字，并把 `_`、`-` 转成空格。

### 生成的 JSON 格式

```json
{
  "id": "2025/shuizu",
  "thumbnail": "https://p.yjimmy.cn/thumbs/2025/shuizu.webp",
  "full": "https://p.yjimmy.cn/large/2025/shuizu.webp",
  "title": "水竹新生",
  "width": 1363,
  "height": 2048,
  "exif": {
    "camera": "Canon EOS R5",
    "lens": "RF14-35mm F4 L IS USM",
    "aperture": "f/2.8",
    "focal": "14mm",
    "shutter": "30s",
    "iso": "3200",
    "location": "内蒙古",
    "date": "2025-01-20"
  }
}
```

`width` / `height` 用于瀑布流预留空间，避免图片加载时页面跳动。

旧的 `params` 中文格式仍然兼容，方便逐步迁移。

---

## 明暗模式

### 使用

点击页眉右侧的太阳/月亮按钮即可切换。

- 浅色模式显示月亮图标，按钮提示“切换到暗黑模式”；
- 暗黑模式显示太阳图标，按钮提示“切换到浅色模式”；
- 按钮状态通过 `aria-pressed` 暴露给读屏。

### 行为

1. 首次访问：跟随系统 `prefers-color-scheme`；
2. 用户点击切换：写入 `localStorage`，之后保持选择；
3. 用户未手动选择时，系统主题变化会实时跟随；
4. 手动选择后，不再跟随系统，直到清除 `localStorage`。

存储 key：

```text
ycamera-theme
```

值为 `light` 或 `dark`。想恢复“跟随系统”，在浏览器控制台执行：

```js
localStorage.removeItem("ycamera-theme");
location.reload();
```

### 避免闪白

`index.html` 在 `<head>` 中同步加载 `js/theme-init.js`，在 CSS 应用前设置 `<html data-theme="...">`，所以刷新时不会先闪一下白色再变黑。

### 自定义颜色

颜色变量集中在 `css/style.css` 顶部：

- `:root`：浅色模式；
- `:root[data-theme="dark"]`：暗黑模式。

主要变量：

| 变量 | 用途 |
|---|---|
| `--bg` | 页面背景 |
| `--text` | 主文字 |
| `--text-secondary` | 次要文字 |
| `--glass-bg` | 页眉/页脚玻璃背景 |
| `--glass-border` | 玻璃边框 |
| `--accent` | 强调色 |
| `--skeleton-bg` | 图片骨架背景 |
| `--shimmer-highlight` | 骨架微光 |
| `--card-shadow` | 卡片阴影 |

暗黑模式默认使用近黑色 `#0b0b0c`，避免纯黑边缘过硬，同时让照片颜色更突出。

---

## 自定义内容

### 头像

替换 `images/avatar.jpg`。建议 88×88 或 176×176。

### 社交链接

编辑 `data/photos.json` 里的 `socialLinks`：

```json
{
  "socialLinks": [
    {
      "name": "Instagram",
      "url": "https://www.instagram.com/...",
      "icon": "instagram"
    }
  ]
}
```

可用图标：`instagram`、`xiaohongshu`、`weibo`、`500px`。

### 网站标题

编辑 `index.html` 中 `.site-title` 的文字。

### 页眉/页脚高度

在 `css/style.css` 的 `:root` 中调整：

```css
--header-height: 64px;
--footer-height: 56px;
```

移动端在 `@media (max-width: 768px)` 和 `@media (max-width: 480px)` 中覆盖。

---

## 文件结构

```text
.
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── main.js                 # 页面逻辑、灯箱、主题切换
│   └── theme-init.js           # 首屏主题初始化，避免闪白
├── data/
│   ├── photos.json             # 网站读取的数据（由脚本生成）
│   └── photo-overrides.json    # 手动覆盖的标题/地点等
├── images/
│   └── avatar.jpg
├── photos/                     # 本地图片工作目录，不上传 GitHub/Pages
│   ├── originals/              # 原图（忽略）
│   ├── large/                  # 灯箱大图（忽略）
│   ├── thumbs/                 # 瀑布流缩略图（忽略）
│   └── README.md
├── scripts/
│   ├── process-photos.mjs      # 压缩 + EXIF + 生成 JSON
│   └── build.mjs               # 生成 dist/
├── _headers                    # Cloudflare Pages 缓存与安全头
├── robots.txt
├── package.json
└── README.md
```

`dist/` 由 `npm run build` 生成，已被 Git 忽略。

---

## 部署

### Cloudflare Pages

| 配置项 | 值 |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | 仓库根目录 |

构建脚本只复制网站运行需要的文件，不复制 `photos/`。

本地直接上传：

```bash
npm run build
npx wrangler pages deploy dist
```

> **不要**直接运行 `npx wrangler pages deploy .`。Cloudflare Pages 的
> Direct Upload 不会读取 `.gitignore`，会把 `photos/` 里的原图一起上传。
> 始终只部署 `dist/`。

### R2 图片

上传：

```text
photos/large/   → R2: large/
photos/thumbs/  → R2: thumbs/
```

给对象设置缓存头：

```text
Cache-Control: public, max-age=31536000, immutable
```

可以在 Cloudflare Dashboard 上传时填写对象元数据，或用 S3 兼容命令：

```bash
aws s3 cp photos/large/ s3://<bucket>/large/ \
  --recursive \
  --cache-control "public, max-age=31536000, immutable"

aws s3 cp photos/thumbs/ s3://<bucket>/thumbs/ \
  --recursive \
  --cache-control "public, max-age=31536000, immutable"
```

上传后验证：

```bash
curl -I https://p.yjimmy.cn/thumbs/shuizu.webp
```

期望看到：

```text
cache-control: public, max-age=31536000, immutable
cf-cache-status: HIT
```

没有设置缓存头时，`cf-cache-status` 会是 `DYNAMIC`，每次请求都可能回源到 R2。

---

## 性能与缓存

### 图片

- 大图最长边 2048，缩略图最长边 800，避免把 4000px 相机原图直接发给浏览器。
- 缩略图在瀑布流中最多显示约 330px 宽，800px 足够覆盖 2x 屏幕。
- 大图只在打开灯箱时加载，并预加载前后各一张。
- 灯箱先用已缓存的缩略图占位，高清图加载完成后再替换。
- 图片带 `width` / `height`，加载前预留空间，减少 CLS。

参考实测（一张 4024×6048 的原图）：

```text
原图：3.3 MB
大图：80.2 KB
缩略图：19.2 KB
```

### Cloudflare Pages

`_headers` 已配置：

- CSS / JS：`max-age=31536000, immutable`
- 图片：`max-age=604800`
- `data/*`：`max-age=300`
- HTML：`max-age=0, must-revalidate`
- 基础安全头 + CSP

CSP 默认只允许 `https://p.yjimmy.cn` 作为外部图片源。如果换了 R2 域名，记得同步修改 `_headers`。

### 渲染

- 移除永久 `will-change`，避免大量合成层。
- 图片加载完成后停止骨架 shimmer 动画。
- 移动端降低灯箱背景模糊半径，减少 GPU 压力。
- 页眉/页脚使用 `backdrop-filter`，不支持时回退到不透明背景。

---

## 已知限制

- 瀑布流使用 CSS 多列，阅读顺序是“列优先”而不是严格的逐行时间顺序。如果需要严格的横向排序，需要换成 JS 瀑布流。
- 灯箱暂未实现双指缩放和照片深链接（`#photo-id`）。
- HEIC/HEIF 不保证可处理，建议先转 JPEG。
- R2 缓存头需要你手动设置；脚本只能生成图片和打印提示。
- 当前 `data/photos.json` 里的第一张照片仍指向旧的 R2 地址，按“图片工作流”迁移后才会换成压缩版本。

---

## 常见问题

### `npm run photos` 报 sharp 安装错误

删除 `node_modules` 后重新安装：

```bash
rm -rf node_modules package-lock.json
npm install
```

sharp 会下载当前平台的预编译二进制。

### 图片上传后仍然 404

确认：

1. R2 前缀是 `large/` 和 `thumbs/`；
2. 自定义域名指向了正确的 bucket；
3. 路径和 `data/photos.json` 中的 URL 完全一致；
4. 没有把 `photos/large/` 整个目录名也上传成 `large/large/`。

### 改了图片但网站没更新

生产环境使用了 `immutable` 缓存。换图时建议换文件名（例如 `shuizu-2.webp`），或者手动清除 R2/Cloudflare 缓存。

### 暗黑模式没有跟随系统

如果你手动点过切换按钮，网站会记住你的选择，不再跟随系统。清除 `localStorage` 的 `ycamera-theme` 即可恢复：

```js
localStorage.removeItem("ycamera-theme");
location.reload();
```

### 暗黑模式下刷新会闪白吗

不会。`js/theme-init.js` 在 `<head>` 中同步执行，先设置 `data-theme` 再应用 CSS。

### 页面显示“照片加载失败”

检查：

- `data/photos.json` 是否存在且 JSON 格式正确；
- `thumbnail` / `full` 是否是合法的 `http/https` 地址；
- 是否在本地用 `file://` 直接打开（`fetch` 会被浏览器拦截）。请使用 `npm run dev` 或任意静态服务器。

### 想调整压缩质量/尺寸

编辑 `scripts/process-photos.mjs` 顶部的 `CONFIG`：

```js
largeMaxEdge: 2048,
thumbMaxEdge: 800,
largeQuality: 82,
thumbQuality: 74,
```

然后：

```bash
npm run photos:force
```
