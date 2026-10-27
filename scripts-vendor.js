// 下载前端依赖到 public/vendor，网站即可不依赖外部 CDN：npm run vendor
import { writeFile, mkdir } from "node:fs/promises";
const files = {
  "pdf.min.js": "pdfjs-dist@3.11.174/build/pdf.min.js",
  "pdf.worker.min.js": "pdfjs-dist@3.11.174/build/pdf.worker.min.js",
  "marked.min.js": "marked@12.0.2/marked.min.js",
  "purify.min.js": "dompurify@3.1.6/dist/purify.min.js",
  "mermaid.min.js": "mermaid@10.9.1/dist/mermaid.min.js",
};
await mkdir(new URL("./public/vendor/", import.meta.url), { recursive: true });
for (const [name, path] of Object.entries(files)) {
  const res = await fetch("https://cdn.jsdelivr.net/npm/" + path);
  if (!res.ok) throw new Error(`下载失败 ${path}: ${res.status}`);
  await writeFile(new URL("./public/vendor/" + name, import.meta.url), Buffer.from(await res.arrayBuffer()));
  console.log("已下载", name);
}
