// 本地运行 / 自有服务器部署：node dev-server.js
// 读取同目录下的 .env，提供 public/ 静态文件和 /api/* 接口。
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { handleAnalyze, handleConfig } from "./lib/core.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const pub = join(root, "public");

// 简单的 .env 解析
const env = { ...process.env };
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const PORT = Number(env.PORT || 8787);

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname === "/api/config" || url.pathname === "/api/analyze") {
      const ctl = new AbortController();
      res.on("close", () => { if (!res.writableEnded) ctl.abort(); });
      const hasBody = !["GET", "HEAD"].includes(req.method);
      const request = new Request(url, {
        method: req.method,
        headers: req.headers,
        body: hasBody ? Readable.toWeb(req) : undefined,
        duplex: hasBody ? "half" : undefined,
        signal: ctl.signal,
      });
      const response = url.pathname === "/api/config" ? handleConfig(env) : await handleAnalyze(request, env);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) {
        for await (const chunk of response.body) res.write(chunk);
      }
      res.end();
      return;
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    if (!p || p.endsWith("/")) p += "index.html";
    const file = join(pub, p);
    if (!file.startsWith(pub)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch (e) {
    if (e && e.code === "ENOENT") { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("未找到页面"); return; }
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "服务器内部错误" }));
  }
}).listen(PORT, () => {
  console.log(`PDF逻辑解析工具已启动：http://localhost:${PORT}`);
  if (!env.LLM_API_KEY) console.log("提示：还没有设置 LLM_API_KEY，请复制 .env.example 为 .env 并填写。");
});
