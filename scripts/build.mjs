#!/usr/bin/env node
/**
 * 构建 Cloudflare Pages 部署目录。
 *
 * 只复制网站运行需要的文件到 dist/，不复制：
 *   photos/      原图与压缩输出（上传到 R2，不进入 Pages）
 *   scripts/     本地脚本
 *   node_modules/
 *
 * 这样即使 photos/ 里有几百 MB 图片，Cloudflare Pages 也不会上传它们。
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const ENTRIES = [
  "index.html",
  "css",
  "js",
  "data",
  "images",
  "_headers",
  "robots.txt",
];

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  for (const entry of ENTRIES) {
    const source = path.join(ROOT, entry);
    if (!(await exists(source))) continue;
    await fs.cp(source, path.join(DIST, entry), { recursive: true });
  }

  // 这个文件只给本地图片脚本用，不需要部署
  await fs.rm(path.join(DIST, "data", "photo-overrides.json"), { force: true });

  // 安全检查：确保图片工作目录不会进入部署产物
  for (const forbidden of ["photos", "scripts", "node_modules"]) {
    if (await exists(path.join(DIST, forbidden))) {
      throw new Error(`构建产物中不应该出现 ${forbidden}/`);
    }
  }

  const files = await fs.readdir(DIST, { withFileTypes: true });
  console.log(`构建完成：${DIST}`);
  console.log(
    `包含：${files
      .map((entry) => `${entry.name}${entry.isDirectory() ? "/" : ""}`)
      .join(", ")}`
  );
  console.log("未包含：photos/（图片请上传到 R2）");
}

main().catch((error) => {
  console.error("构建失败：", error);
  process.exitCode = 1;
});
