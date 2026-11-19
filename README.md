# PDF逻辑解析工具

上传文字版 PDF，AI 自动提取 **要点、核心观点、采用方法、逻辑推理过程、主要结论**，并生成 Mermaid 逻辑框图。结果可下载为 `.md` 和 `.svg`。

- PDF 在访客浏览器内解析，原文件不上传。
- 只有提取出的文字会发送到本站后端，再由后端转发给大模型。
- 模型密钥只保存在服务器环境变量里，访客无需填写。

## 目录结构

```
public/index.html        前端页面（上传、展示、导出）
public/vendor/           可选：放前端依赖库，网站就不依赖外部 CDN
lib/core.js              后端核心：校验、限流、访问码、调用模型、流式返回
lib/prompt.js            提示词（只在服务器端，防止接口被当作通用聊天代理）
api/                     Vercel 部署入口（Edge Functions）
functions/api/           Cloudflare Pages 部署入口（Pages Functions）
dev-server.js            本地运行 / 自有服务器运行（Node.js 18+）
.env.example             环境变量说明
```

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `LLM_API_KEY` | 是 | 模型服务的 API 密钥 |
| `LLM_PROVIDER` | 否 | `openai`（默认，含所有 OpenAI 兼容接口）或 `anthropic` |
| `LLM_BASE_URL` | 否 | 接口地址，例：`https://api.deepseek.com/v1`、`https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `LLM_MODEL` | 否 | 模型名，例：`gpt-4o-mini`、`deepseek-chat`、`qwen-plus`、`claude-sonnet-5-5` |
| `LLM_MAX_TOKENS` | 否 | 单次回答最大 token，默认 8000 |
| `ACCESS_CODE` | 否 | 设置后访客需输入访问码，防止密钥被陌生人消耗（**公开网站强烈建议设置**） |
| `RATE_LIMIT_PER_MIN` | 否 | 每个 IP 每分钟请求上限，默认 10，填 0 关闭 |

## 部署方式一：Vercel（最简单）

1. 把本项目上传到你的 GitHub 仓库。
2. 登录 [vercel.com](https://vercel.com)，点击 **Add New → Project**，导入该仓库。
3. Framework Preset 选 **Other**，其他保持默认。
4. 在 **Environment Variables** 中填入上表中的变量（至少 `LLM_API_KEY`）。
5. 点击 **Deploy**，完成后会得到一个 `https://xxx.vercel.app` 网址。

> 提示：`vercel.app` 域名在中国大陆访问不稳定，面向国内用户建议绑定自己的域名，或使用下面的 Cloudflare / 国内服务器方案。

## 部署方式二：Cloudflare Pages

1. 把项目上传到 GitHub。
2. 登录 Cloudflare 控制台 → **Workers & Pages → Create → Pages → Connect to Git**，选择仓库。
3. 构建设置：Build command 留空，**Build output directory 填 `public`**。
4. 在 **Settings → Variables and Secrets** 中添加环境变量（`LLM_API_KEY` 建议选 Secret 类型）。
5. 部署后得到 `https://xxx.pages.dev` 网址，`functions/` 目录会自动成为 `/api/*` 接口。

## 部署方式三：自己的服务器 / 本地运行

```bash
cp .env.example .env        # 填写 LLM_API_KEY 等
npm run vendor              # 可选：把前端依赖下载到 public/vendor
npm start                   # 默认 http://localhost:8787，端口可用 PORT 变量修改
```

用 Nginx 反向代理时，请关闭该路径的响应缓冲（`proxy_buffering off;`），否则看不到逐字生成的效果。

## 接口说明

- `GET /api/config`：返回 `{configured, accessCodeRequired, model, maxChars}`。
- `POST /api/analyze`：请求头 `x-access-code`（如已设置访问码）。
  - 请求体 `{text, fileName}`：分析文档。
  - 请求体 `{mode: "fix", code, error}`：修正框图代码。
  - 返回纯文本流；中途出错时以 `\n<<<ERROR>>>错误说明` 结尾。

## 安全与成本

- 后端只接受“分析文档”和“修正框图”两种请求，提示词固定在服务器端。
- 拒绝跨站调用，单次文字上限 6 万字，按 IP 限流。
- 限流计数保存在每个服务器实例的内存里，只能挡住明显滥用。公开网站请务必设置 `ACCESS_CODE`，并在模型服务商后台设置每月消费上限。
