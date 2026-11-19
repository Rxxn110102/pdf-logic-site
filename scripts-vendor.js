// 把前端依赖下载到 public/vendor，网站即可完全不依赖外部 CDN。
// 用法：npm run vendor
// 默认从 npmmirror（阿里云镜像，国内可用）下载，失败时改用 npm 官方源。
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, copyFileSync, rmSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const vendor = join(root, "public", "vendor");
const REGISTRIES = ["https://registry.npmmirror.com", "https://registry.npmjs.org"];
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const PACKAGES = [
  { spec: "pdfjs-dist@3.11.174", files: { "build/pdf.min.js": "pdf.min.js", "build/pdf.worker.min.js": "pdf.worker.min.js" }, dirs: { cmaps: "cmaps" } },
  { spec: "marked@12.0.2", files: { "marked.min.js": "marked.min.js" } },
  { spec: "dompurify@3.1.6", files: { "dist/purify.min.js": "purify.min.js" } },
  { spec: "mermaid@10.9.1", files: { "dist/mermaid.min.js": "mermaid.min.js" } },
];

// 只下载包本身的压缩包（不安装依赖），速度快
function fetchTarball(spec, dir) {
  let lastErr;
  for (const reg of REGISTRIES) {
    try {
      execFileSync(npm, ["pack", spec, "--registry", reg, "--silent"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
      const tgz = readdirSync(dir).find((f) => f.endsWith(".tgz"));
      if (tgz) { console.log(`  已下载 ${spec}（${reg.replace("https://", "")}）`); return join(dir, tgz); }
    } catch (e) { lastErr = e; console.log(`  ${reg.replace("https://", "")} 下载 ${spec} 失败，尝试下一个源…`); }
  }
  throw new Error(`无法下载 ${spec}：${lastErr ? lastErr.message : "未知错误"}`);
}

mkdirSync(vendor, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "pdf-logic-vendor-"));
try {
  for (const pkg of PACKAGES) {
    const dir = mkdtempSync(join(work, "p-"));
    const tgz = fetchTarball(pkg.spec, dir);
    execFileSync("tar", ["-xzf", tgz, "-C", dir]);
    const src = join(dir, "package");
    for (const [from, to] of Object.entries(pkg.files)) {
      if (!existsSync(join(src, from))) throw new Error(`${pkg.spec} 中没有 ${from}`);
      copyFileSync(join(src, from), join(vendor, to));
    }
    for (const [from, to] of Object.entries(pkg.dirs || {})) {
      rmSync(join(vendor, to), { recursive: true, force: true });
      cpSync(join(src, from), join(vendor, to), { recursive: true });
    }
  }
  console.log("前端依赖已全部保存到 public/vendor。");
} finally {
  rmSync(work, { recursive: true, force: true });
}
