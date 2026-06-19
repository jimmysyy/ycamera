# Photography — 摄影作品展示网站

苹果极简风格的摄影作品展示静态网站。瀑布流布局，毛玻璃灯箱，响应式适配多端。

## 本地预览

```bash
cd photograph
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
```

## 自定义内容

### 替换照片和图床

编辑 `js/main.js` 中的 `photos` 数组，修改每张照片的 `thumbnail` 和 `full` 为你的 R2 地址：

```js
{
  id: 1,
  thumbnail: "https://your-r2-domain.com/thumb/photo1.webp",
  full: "https://your-r2-domain.com/full/photo1.webp",
  title: "作品标题",
  params: {
    光圈: "f/5.6",
    ISO: "200",
    焦段: "24mm",
    快门: "1/320s",
    相机: "Sony A7M4",
    日期: "2025-03-15",
    地点: "黄山",
  },
}
```

### 替换头像

替换 `images/avatar.svg` 为你的头像图片（推荐 88×88px PNG/WebP），并修改 `index.html` 中 `<img>` 的 `src` 属性。

### 修改社交链接

编辑 `js/main.js` 中的 `socialLinks` 数组。

### 修改网站标题

编辑 `index.html` 中 `.site-title` 的文字内容。

## 部署到 Cloudflare Pages

1. 将项目推送到 GitHub / GitLab 仓库
2. 登录 Cloudflare Dashboard → Workers & Pages → Pages
3. 创建新项目，连接仓库
4. 构建设置：
   - **Build command**: 留空（纯静态无需构建）
   - **Build output directory**: `/`（或留空）
5. 部署

## R2 图床配置

1. 在 Cloudflare Dashboard 创建 R2 存储桶
2. 上传图片（建议生成缩略图和全尺寸两个版本）
3. 绑定自定义域名（如 `cdn.yourdomain.com`）
4. 在 `js/main.js` 中将图片 URL 指向 R2 域名

### 图片优化建议

- **缩略图**: 600px 宽，WebP 格式，质量 75%，用于瀑布流
- **全尺寸**: 1800px 宽，WebP 格式，质量 85%，用于灯箱
- 启用 R2 的缓存策略，设置 `Cache-Control: public, max-age=31536000`

## 文件结构

```
photograph/
├── index.html          # 主页面
├── css/
│   └── style.css       # 样式
├── js/
│   └── main.js         # 逻辑 & 数据配置
├── images/
│   └── avatar.svg      # 头像占位
└── README.md
```

## 技术特点

- 纯静态 — 零框架依赖，部署即用
- CSS Grid 瀑布流 — 原生性能
- `backdrop-filter` 毛玻璃 — 苹果风格
- `IntersectionObserver` 懒加载 — 优化首屏
- 触摸手势 & 键盘导航 — 全端交互
