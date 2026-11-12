#!/usr/bin/env node
/**
 * 摄影作品图片处理脚本
 *
 * 输入：photos/originals/   （原图，递归扫描）
 * 输出：photos/large/       （灯箱大图，最长边 2048，WebP）
 *       photos/thumbs/      （瀑布流缩略图，最长边 800，WebP）
 *
 * 同时读取 EXIF，并更新 data/photos.json。
 *
 * 用法：
 *   npm run photos              # 增量处理，更新 data/photos.json
 *   npm run photos:force        # 强制重新压缩
 *   node scripts/process-photos.mjs --no-data    # 只压图，不改 JSON
 *   node scripts/process-photos.mjs --prune      # 删除没有原图对应的旧输出
 *   node scripts/process-photos.mjs --base-url https://cdn.example.com
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import exifr from "exifr";
import exifReader from "exif-reader";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGINALS_DIR = path.join(ROOT, "photos", "originals");
const LARGE_DIR = path.join(ROOT, "photos", "large");
const THUMBS_DIR = path.join(ROOT, "photos", "thumbs");
const MANIFEST_FILE = path.join(ROOT, "photos", "manifest.json");
const DATA_FILE = path.join(ROOT, "data", "photos.json");
const OVERRIDES_FILE = path.join(ROOT, "data", "photo-overrides.json");

const CONFIG = {
  // R2 自定义域名。上传目录为 large/ 和 thumbs/
  baseUrl: "https://p.yjimmy.cn",
  largeDir: "large",
  thumbsDir: "thumbs",
  largeMaxEdge: 2048,
  thumbMaxEdge: 800,
  largeQuality: 82,
  thumbQuality: 74,
  effort: 5,
};

const SUPPORTED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
  ".avif",
]);
const HEIC_EXTENSIONS = new Set([".heic", ".heif"]);
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

// ============================================================
// CLI
// ============================================================
const argv = process.argv.slice(2);

function hasFlag(name) {
  return argv.includes(name);
}

function getOption(name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

const FORCE = hasFlag("--force");
const PRUNE = hasFlag("--prune");
const WRITE_DATA = !hasFlag("--no-data");
const BASE_URL = (
  getOption("--base-url") ||
  process.env.PHOTO_CDN_BASE ||
  CONFIG.baseUrl
).replace(/\/+$/, "");

if (!/^https?:\/\/[^/]+/i.test(BASE_URL)) {
  console.error(`R2 地址无效: "${BASE_URL}"，请使用 https://cdn.example.com 形式。`);
  process.exit(1);
}

if (hasFlag("--help") || hasFlag("-h")) {
  console.log(`
图片处理脚本

  npm run photos                         增量处理并更新 data/photos.json
  npm run photos:force                   强制全部重新压缩
  npm run photos -- --no-data            只生成图片，不修改 JSON
  npm run photos -- --prune              清理没有原图对应的旧输出
  npm run photos -- --base-url <url>     指定 R2 自定义域名

目录：
  photos/originals/   放原图（会被 Git 和 Cloudflare Pages 忽略）
  photos/large/       灯箱大图输出
  photos/thumbs/      瀑布流缩略图输出
  data/photo-overrides.json  手动补充/覆盖 EXIF 和标题
`);
  process.exit(0);
}

// ============================================================
// 工具函数
// ============================================================
function log(message = "") {
  console.log(message);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function trimNumber(value) {
  return String(Number(Number(value).toFixed(1)));
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function text(value) {
  if (value == null) return "";
  return String(value).trim();
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error(`读取 ${path.relative(ROOT, file)} 失败: ${error.message}`);
  }
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursive(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === ".gitkeep" || entry.name === ".DS_Store") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(full, base)));
    } else if (entry.isFile()) {
      files.push(toPosix(path.relative(base, full)));
    }
  }

  return files;
}

// ============================================================
// EXIF
// ============================================================
async function readRawExif(file) {
  // exifr 对 JPEG/PNG/TIFF/AVIF 支持较好，直接按文件解析
  try {
    const data = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      ifd0: true,
      translateKeys: true,
      translateValues: false,
      reviveValues: true,
    });
    if (data) return { raw: data, source: "exifr" };
  } catch {
    // WebP 等格式 exifr 可能不支持，回退到 sharp + exif-reader
  }

  // 回退：sharp 取原始 EXIF buffer，exif-reader 解析
  try {
    const metadata = await sharp(file).metadata();
    if (metadata.exif) {
      return { raw: exifReader(metadata.exif), source: "exif-reader" };
    }
  } catch {
    // 没有 EXIF 或文件无法读取，交给上层给出警告
  }

  return { raw: null, source: "none" };
}

function dmsToDecimal(value, ref) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!Array.isArray(value) || value.length < 3) return null;

  const [degrees, minutes, seconds] = value.map(Number);
  if (![degrees, minutes, seconds].every(Number.isFinite)) return null;

  const decimal = degrees + minutes / 60 + seconds / 3600;
  return /^[SW]/i.test(text(ref)) ? -decimal : decimal;
}

function normalizeExif(raw) {
  if (!raw || typeof raw !== "object") return {};

  // exifr 返回扁平对象；exif-reader 返回 { Image, Photo, GPSInfo }
  const image = raw.Image || raw;
  const photo = raw.Photo || raw;
  const gps = raw.GPSInfo || raw;

  const latitude =
    Number.isFinite(raw.latitude) && Number.isFinite(raw.longitude)
      ? raw.latitude
      : dmsToDecimal(gps.GPSLatitude, gps.GPSLatitudeRef);
  const longitude =
    Number.isFinite(raw.latitude) && Number.isFinite(raw.longitude)
      ? raw.longitude
      : dmsToDecimal(gps.GPSLongitude, gps.GPSLongitudeRef);

  return {
    make: text(image.Make),
    model: text(image.Model),
    lens: text(photo.LensModel || photo.Lens || image.LensModel),
    fNumber: Number(photo.FNumber ?? raw.FNumber),
    exposureTime: photo.ExposureTime ?? raw.ExposureTime,
    iso: photo.ISOSpeedRatings ?? photo.ISO ?? photo.ISOSpeed ?? raw.ISO,
    focalLength: Number(photo.FocalLength ?? raw.FocalLength),
    dateOriginal:
      photo.DateTimeOriginal ||
      photo.CreateDate ||
      raw.DateTimeOriginal ||
      image.DateTime,
    latitude,
    longitude,
  };
}

function formatCamera(make, model) {
  const cleanMake = text(make).replace(
    /\s+(CORPORATION|CO\.,?\s*LTD\.?|INC\.?|COMPANY)$/i,
    ""
  );
  const cleanModel = text(model);

  if (!cleanModel) return cleanMake;
  if (!cleanMake) return cleanModel;
  if (cleanModel.toLowerCase().startsWith(cleanMake.toLowerCase())) return cleanModel;
  return `${cleanMake} ${cleanModel}`;
}

function formatAperture(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return `f/${trimNumber(number)}`;
}

function formatShutter(value) {
  if (value == null || value === "") return "";

  if (typeof value === "string" && value.includes("/")) {
    return value.endsWith("s") ? value : `${value}s`;
  }

  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  if (number >= 1) return `${trimNumber(number)}s`;
  return `1/${Math.round(1 / number)}s`;
}

function formatIso(value) {
  if (Array.isArray(value)) value = value[0];
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return String(Math.round(number));
  return text(value).replace(/^ISO\s*/i, "");
}

function formatFocal(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return text(value);
  return `${trimNumber(number)}mm`;
}

function formatDate(value) {
  if (!value) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    // EXIF 没有时区，使用本地时间读取，避免跨时区偏移
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }

  const match = text(value).match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function formatGps(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  if (latitude === 0 && longitude === 0) return "";

  const latRef = latitude >= 0 ? "N" : "S";
  const lonRef = longitude >= 0 ? "E" : "W";
  return `${Math.abs(latitude).toFixed(4)}°${latRef}, ${Math.abs(longitude).toFixed(4)}°${lonRef}`;
}

function buildExif(raw) {
  const normalized = normalizeExif(raw);
  return {
    camera: formatCamera(normalized.make, normalized.model),
    lens: normalized.lens,
    aperture: formatAperture(normalized.fNumber),
    focal: formatFocal(normalized.focalLength),
    shutter: formatShutter(normalized.exposureTime),
    iso: formatIso(normalized.iso),
    location: formatGps(normalized.latitude, normalized.longitude),
    date: formatDate(normalized.dateOriginal),
  };
}

// ============================================================
// 命名 / overrides
// ============================================================
function findOverride(overrides, relPath) {
  if (!overrides || typeof overrides !== "object") return {};
  const base = path.posix.basename(relPath);
  return overrides[relPath] || overrides[base] || {};
}

function titleFromFilename(relPath) {
  const base = path.posix.basename(relPath, path.posix.extname(relPath));
  return (
    base
      .replace(/^\d+[-_.\s]+/, "")
      .replace(/[_-]+/g, " ")
      .trim() || base
  );
}

function safeBaseName(relPath) {
  const base = path.posix.basename(relPath, path.posix.extname(relPath));
  const safe = base
    .normalize("NFC")
    .replace(/[\\/:*?"<>|#%]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safe || `photo-${Date.now()}`;
}

function outputRelPath(relPath) {
  const directory = path.posix.dirname(relPath);
  const filename = `${safeBaseName(relPath)}.webp`;
  return directory === "." ? filename : `${directory}/${filename}`;
}

function slugify(relPath) {
  const withoutExtension = relPath.replace(/\.[^./]+$/, "");
  return (
    withoutExtension
      .normalize("NFC")
      .replace(/[^\p{L}\p{N}/_-]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^[-/]+|[-/]+$/g, "")
      .toLowerCase() || "photo"
  );
}

function joinCdnUrl(directory, relPath) {
  const encoded = relPath.split("/").map(encodeURIComponent).join("/");
  return `${BASE_URL}/${directory}/${encoded}`;
}

function implicitOrder(relPath) {
  const match = path.posix.basename(relPath).match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

function applyOverrides(exif, override) {
  const merged = { ...exif };
  const keys = ["camera", "lens", "aperture", "focal", "shutter", "iso", "location", "date"];

  for (const key of keys) {
    if (override[key] != null && override[key] !== "") {
      merged[key] = String(override[key]);
    }
  }

  return merged;
}

// ============================================================
// 图片处理
// ============================================================
async function needsProcessing(sourceStat, largeFile, thumbFile) {
  if (FORCE) return true;

  try {
    const [largeStat, thumbStat] = await Promise.all([
      fs.stat(largeFile),
      fs.stat(thumbFile),
    ]);
    return largeStat.mtimeMs < sourceStat.mtimeMs || thumbStat.mtimeMs < sourceStat.mtimeMs;
  } catch {
    return true;
  }
}

async function processOne(relPath, override) {
  const sourceFile = path.join(ORIGINALS_DIR, relPath);
  const outRel = outputRelPath(relPath);
  const largeFile = path.join(LARGE_DIR, outRel);
  const thumbFile = path.join(THUMBS_DIR, outRel);

  const sourceStat = await fs.stat(sourceFile);
  const shouldProcess = await needsProcessing(sourceStat, largeFile, thumbFile);
  let largeBytes;
  let thumbBytes;

  const rawExifResult = await readRawExif(sourceFile);
  const rawExif = buildExif(rawExifResult.raw);
  const exif = applyOverrides(rawExif, override);

  if (shouldProcess) {
    const pipeline = sharp(sourceFile, { failOn: "error" })
      .rotate() // 按 EXIF Orientation 自动摆正
      .toColourspace("srgb");

    const [largeBuffer, thumbBuffer] = await Promise.all([
      pipeline
        .clone()
        .resize({
          width: CONFIG.largeMaxEdge,
          height: CONFIG.largeMaxEdge,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: CONFIG.largeQuality, effort: CONFIG.effort })
        .toBuffer(),
      pipeline
        .clone()
        .resize({
          width: CONFIG.thumbMaxEdge,
          height: CONFIG.thumbMaxEdge,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: CONFIG.thumbQuality, effort: CONFIG.effort })
        .toBuffer(),
    ]);

    await Promise.all([
      fs.mkdir(path.dirname(largeFile), { recursive: true }),
      fs.mkdir(path.dirname(thumbFile), { recursive: true }),
    ]);
    await Promise.all([
      fs.writeFile(largeFile, largeBuffer),
      fs.writeFile(thumbFile, thumbBuffer),
    ]);

    largeBytes = largeBuffer.length;
    thumbBytes = thumbBuffer.length;
  } else {
    largeBytes = (await fs.stat(largeFile)).size;
    thumbBytes = (await fs.stat(thumbFile)).size;
  }

  const outputMetadata = await sharp(largeFile).metadata();
  const title = text(override.title) || titleFromFilename(relPath);

  return {
    source: relPath,
    outputRel: outRel,
    title,
    id: text(override.id) || slugify(relPath),
    order:
      Number.isFinite(Number(override.order)) && override.order !== ""
        ? Number(override.order)
        : implicitOrder(relPath),
    hidden: override.hidden === true,
    width: outputMetadata.width || 0,
    height: outputMetadata.height || 0,
    largeBytes,
    thumbBytes,
    exifSource: rawExifResult.source,
    hadExif: Boolean(rawExifResult.raw),
    exif,
    thumbnail: joinCdnUrl(CONFIG.thumbsDir, outRel),
    full: joinCdnUrl(CONFIG.largeDir, outRel),
    processed: shouldProcess,
  };
}

async function pruneOutputs(keep) {
  let removed = 0;

  for (const dir of [LARGE_DIR, THUMBS_DIR]) {
    const files = await listFilesRecursive(dir);
    for (const rel of files) {
      if (keep.has(rel)) continue;
      await fs.unlink(path.join(dir, rel));
      log(`  - 删除旧输出: ${path.posix.join(path.basename(dir), rel)}`);
      removed += 1;
    }
  }

  return removed;
}

async function writeDataFile(results, existingData) {
  const data = existingData && typeof existingData === "object" ? existingData : {};
  const usedIds = new Set();

  data.photos = results.map((item) => {
    let id = item.id;
    let suffix = 2;
    while (usedIds.has(id)) id = `${item.id}-${suffix++}`;
    usedIds.add(id);

    const exif = Object.fromEntries(
      Object.entries(item.exif).filter(([, value]) => value)
    );

    return {
      id,
      thumbnail: item.thumbnail,
      full: item.full,
      title: item.title,
      width: item.width,
      height: item.height,
      exif,
    };
  });

  if (!Array.isArray(data.socialLinks)) data.socialLinks = [];

  await fs.writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeManifest(results) {
  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    largeDir: CONFIG.largeDir,
    thumbsDir: CONFIG.thumbsDir,
    photos: results.map((item) => ({
      source: `photos/originals/${item.source}`,
      large: `photos/large/${item.outputRel}`,
      thumbnail: `photos/thumbs/${item.outputRel}`,
      width: item.width,
      height: item.height,
      largeBytes: item.largeBytes,
      thumbBytes: item.thumbBytes,
      exif: item.exif,
    })),
  };

  await fs.writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  await Promise.all([
    fs.mkdir(ORIGINALS_DIR, { recursive: true }),
    fs.mkdir(LARGE_DIR, { recursive: true }),
    fs.mkdir(THUMBS_DIR, { recursive: true }),
  ]);

  const allFiles = await listFilesRecursive(ORIGINALS_DIR);
  const heicFiles = allFiles.filter((file) =>
    HEIC_EXTENSIONS.has(path.posix.extname(file).toLowerCase())
  );
  const sourceFiles = allFiles
    .filter((file) => SUPPORTED_EXTENSIONS.has(path.posix.extname(file).toLowerCase()))
    .sort(collator.compare);

  if (heicFiles.length > 0) {
    log(`⚠ HEIC/HEIF 暂不保证支持，请先转为 JPEG：${heicFiles.join(", ")}`);
  }

  if (sourceFiles.length === 0) {
    log("photos/originals/ 里还没有原图。");
    log("");
    log("把 JPG/PNG/TIFF/WebP/AVIF 原图放进 photos/originals/，再运行：");
    log("  npm run photos");
    log("");
    log("目录说明：");
    log("  photos/originals/  原图（不会提交到 GitHub，也不会进入 Cloudflare Pages）");
    log("  photos/large/      灯箱大图输出");
    log("  photos/thumbs/     瀑布流缩略图输出");
    return;
  }

  const overrides = await readJson(OVERRIDES_FILE, {});
  const existingData = await readJson(DATA_FILE, {});
  const results = [];
  const errors = [];
  const usedOutputs = new Set();
  const usedOutputNames = new Map();

  log(`找到 ${sourceFiles.length} 张原图，开始处理...`);
  log("");

  for (const relPath of sourceFiles) {
    const override = findOverride(overrides, relPath);

    if (override.hidden === true) {
      log(`- 跳过（hidden）: ${relPath}`);
      continue;
    }

    const outRel = outputRelPath(relPath);
    if (usedOutputNames.has(outRel)) {
      const error = new Error(
        `输出文件名冲突: ${relPath} 与 ${usedOutputNames.get(outRel)} 都会生成 ${outRel}`
      );
      errors.push({ file: relPath, error });
      log(`✗ ${relPath}: ${error.message}`);
      continue;
    }
    usedOutputNames.set(outRel, relPath);

    try {
      const result = await processOne(relPath, override);
      results.push(result);
      usedOutputs.add(result.outputRel);

      const exifSummary = [
        result.exif.camera,
        result.exif.lens,
        result.exif.aperture,
        result.exif.shutter,
        result.exif.iso ? `ISO ${result.exif.iso}` : "",
        result.exif.focal,
        result.exif.date,
      ]
        .filter(Boolean)
        .join(" · ");

      log(
        `${result.processed ? "✓" : "·"} ${relPath} → ${result.outputRel}`
      );
      log(
        `  大图 ${formatBytes(result.largeBytes)} / 缩略图 ${formatBytes(
          result.thumbBytes
        )} / ${result.width}×${result.height}`
      );
      log(
        `  EXIF: ${exifSummary || "未读取到，可在 data/photo-overrides.json 手动补充"}`
      );
      if (!result.hadExif) {
        log(`  提示: 这张图没有 EXIF 元数据（来源: ${result.exifSource}）`);
      }
    } catch (error) {
      errors.push({ file: relPath, error });
      log(`✗ ${relPath}: ${error.message}`);
    }
  }

  results.sort((a, b) => {
    const orderA = a.order ?? Number.POSITIVE_INFINITY;
    const orderB = b.order ?? Number.POSITIVE_INFINITY;
    if (orderA !== orderB) return orderA - orderB;
    return collator.compare(a.source, b.source);
  });

  if (PRUNE && errors.length === 0) {
    const removed = await pruneOutputs(usedOutputs);
    log("");
    log(`清理完成，删除 ${removed} 个旧输出文件。`);
  }

  if (errors.length > 0) {
    log("");
    log(`有 ${errors.length} 张图片处理失败，已停止更新 data/photos.json。`);
    process.exitCode = 1;
  } else if (WRITE_DATA) {
    await writeDataFile(results, existingData);
    await writeManifest(results);
    log("");
    log(`已更新 data/photos.json（${results.length} 张）。`);
  } else {
    await writeManifest(results);
    log("");
    log("已跳过 data/photos.json（--no-data）。");
  }

  const totalLarge = results.reduce((sum, item) => sum + item.largeBytes, 0);
  const totalThumbs = results.reduce((sum, item) => sum + item.thumbBytes, 0);

  log("");
  log(
    `总计：${results.length} 张，大图 ${formatBytes(
      totalLarge
    )}，缩略图 ${formatBytes(totalThumbs)}`
  );
  log("");
  log("下一步：");
  log(`1. 上传 photos/large/ 到 R2 的 ${CONFIG.largeDir}/ 目录`);
  log(`2. 上传 photos/thumbs/ 到 R2 的 ${CONFIG.thumbsDir}/ 目录`);
  log("3. 给 R2 对象设置 Cache-Control: public, max-age=31536000, immutable");
  log("4. 运行 npm run build，然后部署 dist/ 到 Cloudflare Pages");
}

main().catch((error) => {
  console.error("");
  console.error("处理失败：", error);
  process.exitCode = 1;
});
