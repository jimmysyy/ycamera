# photos/ 本地图片工作目录

这个目录里的图片不会提交到 GitHub，也不会进入 Cloudflare Pages 的部署产物。

```text
photos/
├── originals/   把相机原图放这里（支持子目录）
├── large/       脚本输出：灯箱大图，上传到 R2 的 large/
└── thumbs/      脚本输出：瀑布流缩略图，上传到 R2 的 thumbs/
```

使用：

```bash
npm run photos            # 压缩 + 读取 EXIF + 更新 data/photos.json
npm run photos:force      # 强制重新压缩
npm run photos -- --prune # 清理没有原图对应的旧输出
```

详细说明见项目根目录的 `README.md`。
