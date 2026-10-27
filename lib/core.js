// 平台无关的后端逻辑：只依赖标准 Request / Response / fetch，
// 同时供 Vercel Edge Functions、Cloudflare Pages Functions 和本地开发服务器使用。
import { buildAnalyzePrompt, buildFixPrompt } from "./prompt.js";

export const MAX_CHARS = 60000;        // 单次分析接受的最大文字量
const MAX_BODY_BYTES = 600_000;
export const ERROR_MARK = "\n<<<ERROR>>>";   // 流式输出中途出错时附加在末尾

function readConfig(env = {}) {
  const provider = String(env.LLM_PROVIDER || "openai").toLowerCase() === "anthropic" ? "anthropic" : "openai";
  const defBase = provider === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1";
  const defModel = provider === "anthropic" ? "claude-sonnet-5-5" : "gpt-4o-mini";
  return {
    provider,
    apiKey: env.LLM_API_KEY || "",
    baseUrl: String(env.LLM_BASE_URL || defBase).replace(/\/+$/, ""),
    model: env.LLM_MODEL || defModel,
    maxTokens: parseInt(env.LLM_MAX_TOKENS || "8000", 10) || 8000,
    accessCode: env.ACCESS_CODE || "",
    ratePerMin: parseInt(env.RATE_LIMIT_PER_MIN || "10", 10) || 0,
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

// 简单的按 IP 限流（每个服务器实例各自计数，只用于挡住明显的滥用）
const hits = new Map();
function rateLimited(ip, perMin) {
  if (!perMin) return false;
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (list.length >= perMin) { hits.set(ip, list); return true; }
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return false;
}
function clientIp(req) {
  return req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
}
function sameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(req.url).host; } catch { return false; }
}

export function handleConfig(env) {
  const c = readConfig(env);
  return json({ configured: !!c.apiKey, accessCodeRequired: !!c.accessCode, model: c.model, maxChars: MAX_CHARS });
}

function upstreamErrorText(status, body) {
  let detail = "";
  try { const j = JSON.parse(body); detail = (j.error && (j.error.message || j.error.type)) || j.message || ""; } catch { detail = String(body).slice(0, 200); }
  if (status === 401 || status === 403) return "服务器的模型密钥无效或没有权限，请联系网站管理员。";
  if (status === 404) return "服务器配置的模型或接口地址不存在，请联系网站管理员。";
  if (status === 429) return "AI 服务繁忙或额度不足，请稍后再试。";
  if (status === 413 || /context|too long|maximum|token/i.test(detail)) return "文档太长，超出了模型能处理的长度。请换一个更短的 PDF。";
  return `AI 服务出错（${status}）。请稍后重试。`;
}

export async function handleAnalyze(req, env) {
  if (req.method !== "POST") return json({ error: "只支持 POST 请求。" }, 405);
  if (!sameOrigin(req)) return json({ error: "不允许跨站调用。" }, 403);
  const c = readConfig(env);
  if (!c.apiKey) return json({ error: "网站还没有配置 AI 模型密钥，请联系网站管理员。" }, 503);
  if (c.accessCode && req.headers.get("x-access-code") !== c.accessCode) {
    return json({ error: "访问码不正确，请重新输入。", code: "bad_access_code" }, 401);
  }
  if (rateLimited(clientIp(req), c.ratePerMin)) return json({ error: "请求太频繁，请一分钟后再试。" }, 429);
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json({ error: "提交的文字太多。" }, 413);

  let body;
  try { body = await req.json(); } catch { return json({ error: "请求格式错误。" }, 400); }
  if (!body || typeof body !== "object") return json({ error: "请求格式错误。" }, 400);

  let prompt;
  if (body.mode === "fix") {
    const code = typeof body.code === "string" ? body.code.slice(0, 8000) : "";
    const err = typeof body.error === "string" ? body.error.slice(0, 1000) : "";
    if (!code.trim()) return json({ error: "没有需要修正的框图代码。" }, 400);
    prompt = buildFixPrompt(code, err);
  } else {
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < 20) return json({ error: "文档文字太少，无法分析。" }, 400);
    if (text.length > MAX_CHARS + 500) return json({ error: "提交的文字超过上限。" }, 413);
    const name = (typeof body.fileName === "string" ? body.fileName : "文档").replace(/[\r\n《》]/g, " ").slice(0, 100);
    prompt = buildAnalyzePrompt(text, name);
  }

  // 调用模型服务（流式）
  let up;
  try {
    if (c.provider === "anthropic") {
      up = await fetch(c.baseUrl + "/v1/messages", {
        method: "POST", signal: req.signal,
        headers: { "content-type": "application/json", "x-api-key": c.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: c.model, max_tokens: c.maxTokens, stream: true, messages: [{ role: "user", content: prompt }] }),
      });
    } else {
      up = await fetch(c.baseUrl + "/chat/completions", {
        method: "POST", signal: req.signal,
        headers: { "content-type": "application/json", authorization: "Bearer " + c.apiKey },
        body: JSON.stringify({ model: c.model, stream: true, temperature: 0.2, max_tokens: c.maxTokens, messages: [{ role: "user", content: prompt }] }),
      });
    }
  } catch (e) {
    return json({ error: "服务器连接 AI 服务失败，请稍后重试。" }, 502);
  }
  if (!up.ok || !up.body) {
    const t = await up.text().catch(() => "");
    console.error("upstream error", up.status, t.slice(0, 500));
    return json({ error: upstreamErrorText(up.status, t) }, 502);
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const reader = up.body.getReader();
  const isAnthropic = c.provider === "anthropic";
  let buf = "";

  const stream = new ReadableStream({
    async pull(controller) {
      // 每次 pull 读取上游一块，转换成纯文本增量
      try {
        // 循环读取，直到产出文本或上游结束（pull 不产出数据时不会被再次调用）
        for (;;) {
        const { value, done } = await reader.read();
        if (done) { controller.close(); return; }
        buf += dec.decode(value, { stream: true });
        let out = "", idx;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          let j; try { j = JSON.parse(data); } catch { continue; }
          if (isAnthropic) {
            if (j.type === "content_block_delta" && j.delta && typeof j.delta.text === "string") out += j.delta.text;
            else if (j.type === "error") out += ERROR_MARK + "AI 服务中途出错，请重试。";
          } else {
            const d = j.choices && j.choices[0] && j.choices[0].delta;
            if (d && typeof d.content === "string") out += d.content;
            if (j.error) out += ERROR_MARK + "AI 服务中途出错，请重试。";
          }
        }
        if (out) { controller.enqueue(enc.encode(out)); return; }
        }
      } catch (e) {
        try { controller.enqueue(enc.encode(ERROR_MARK + "与 AI 服务的连接中断，请重试。")); controller.close(); } catch {}
      }
    },
    cancel() { try { reader.cancel(); } catch {} },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
