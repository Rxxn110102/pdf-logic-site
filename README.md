# PDF逻辑解析工具（国内可访问版）

上传文字版 PDF，AI 自动提取 **要点、核心观点、采用方法、逻辑推理过程、主要结论**，并生成逻辑框图。结果可下载为 `.md` 和 `.svg`。

这个版本面向中国大陆用户，做了以下调整：

| 问题 | 处理方式 |
| --- | --- |
| Google 字体在国内无法加载 | 改用系统自带中文字体（苹方、微软雅黑、宋体） |
| jsDelivr、unpkg 等国外 CDN 不稳定 | 前端组件保存在网站自己的服务器上；缺失时改从 npmmirror（阿里云）加载 |
| OpenAI、Claude 接口在国内无法调用 | 默认使用 DeepSeek，也支持通义千问、Kimi |
| Vercel、Cloudflare 的网址在国内经常打不开 | 改为部署到国内或香港的云服务器，提供一键安装脚本 |
| 中文 PDF 有时提取不出文字 | 加入 PDF 中文字符映射表（cMaps） |

PDF 在访客的浏览器里解析，原文件不上传。只有提取出的文字会经过你的服务器发送给模型服务商，服务器不保存文档内容。

---

## 部署前准备

### 1. 模型 API 密钥（任选其一）

- **DeepSeek**：在 DeepSeek 开放平台注册、充值，创建 API Key。
- **通义千问**：在阿里云百炼控制台开通服务，创建 API Key。
- **Kimi**：在月之暗面开放平台创建 API Key。

### 2. 一台云服务器

| 方案 | 适合 | 是否需要备案 |
| --- | --- | --- |
| **A. 香港地域的轻量应用服务器**（腾讯云、阿里云都有） | 想尽快上线 | 不需要，买完就能用 IP 访问 |
| **B. 内地地域服务器 + 自己的域名** | 想要更快、更稳的国内访问 | 域名必须先完成 ICP 备案，通常需要 1～3 周 |

- 配置选最低档即可，例如 1 核 CPU、1～2 GB 内存。
- 系统建议选 **Ubuntu 22.04**。
- 内地服务器在备案完成之前，只能用 IP 地址访问；用域名访问会被云服务商拦截。

---

## 一键部署（以腾讯云轻量应用服务器为例）

1. 在云服务器控制台找到你的服务器，点击 **登录**，打开网页终端，不需要额外安装软件。
2. 依次运行下面的命令，把代码下载到服务器：

   ```bash
   sudo apt-get update && sudo apt-get install -y git
   git clone https://github.com/Rxxn110102/pdf-logic-site.git
   cd pdf-logic-site
   ```

   > 内地服务器访问 GitHub 可能很慢或失败。可以先把项目压缩包上传到服务器（网页终端一般有“上传文件”功能），再运行 `sudo apt-get install -y unzip && unzip pdf-logic-site-cn.zip && cd pdf-logic-site-cn`。

3. 运行一键安装脚本：

   ```bash
   sudo bash deploy/install.sh
   ```

   脚本会依次询问：
   - 模型服务：直接回车表示 DeepSeek。
   - API 密钥：粘贴时屏幕不显示，这是正常的。
   - 模型名称：直接回车使用默认值。
   - 访问码：建议设置，防止陌生人消耗你的额度。

   然后它会自动完成：从国内镜像安装 Node.js、下载前端组件、创建开机自启的服务、配置 Nginx。

4. 看到 **“部署完成！”** 后，在浏览器打开 `http://你的服务器公网IP`。
5. 如果打不开，到云服务器控制台的 **防火墙 / 安全组**，放行 **TCP 80** 端口。

---

## 绑定域名与 HTTPS（可选）

1. 在域名服务商那里添加一条 **A 记录**，指向服务器公网 IP。内地服务器需要先完成备案。
2. 编辑 `/etc/nginx/conf.d/pdf-logic.conf`，把 `server_name _;` 改成 `server_name 你的域名;`，然后运行 `sudo systemctl reload nginx`。
3. 申请免费证书。可以在云服务商控制台申请 SSL 证书并按说明安装到 Nginx，也可以在服务器上使用 certbot。

---

## 日常维护

| 操作 | 命令 |
| --- | --- |
| 修改配置（密钥、模型、访问码） | `sudo nano /opt/pdf-logic-site/.env`，保存后运行 `sudo systemctl restart pdf-logic` |
| 查看运行日志 | `sudo journalctl -u pdf-logic -f` |
| 更新代码 | 在项目目录运行 `git pull && sudo bash deploy/install.sh`，原有配置会保留 |
| 停止网站 | `sudo systemctl stop pdf-logic` |

## 配置项（/opt/pdf-logic-site/.env）

| 变量 | 说明 |
| --- | --- |
| `LLM_PROVIDER` | `deepseek`（默认）、`qwen`、`kimi`、`openai`、`anthropic`，或 `custom` 表示其他 OpenAI 兼容接口 |
| `LLM_API_KEY` | API 密钥（必填） |
| `LLM_BASE_URL` | 接口地址。留空时使用所选服务商的默认地址；`custom` 时必填 |
| `LLM_MODEL` | 模型名称。留空时默认为 `deepseek-flash` / `qwen-plus` / `kimi-k2.6`；服务商更新模型后，按控制台显示的名称填写 |
| `ACCESS_CODE` | 访问码。设置后访客需输入才能使用 |
| `RATE_LIMIT_PER_MIN` | 每个 IP 每分钟请求上限，默认 10 |
| `LLM_MAX_TOKENS` | 单次回答最大 token 数，默认 8000 |

> 通义千问：如果百炼控制台给出的接口地址带有业务空间 ID（形如 `https://xxxx.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`），请把它填到 `LLM_BASE_URL`。

---

## 常见问题

- **网页提示“访问码不正确”**：在页面上的访问码输入框中输入 `.env` 里设置的 `ACCESS_CODE`。
- **提示“密钥无效”或“模型不存在”**：检查 `.env` 里的 `LLM_API_KEY` 和 `LLM_MODEL`，改完后重启服务。
- **结果不是逐字显示，而是最后一次性出现**：如果你自己配置了其他反向代理或 CDN，需要对 `/api/` 关闭缓冲。
- **中文 PDF 提取不出文字**：确认 `/opt/pdf-logic-site/public/vendor/cmaps` 目录存在；如果不存在，回到项目目录重新运行 `sudo bash deploy/install.sh`（会重新下载组件，配置保留）。扫描图片版 PDF 不受支持。

## 合规提示（非法律意见）

- 使用内地服务器和域名对外提供网站，需要完成 **ICP 备案**。
- 面向境内公众提供生成式 AI 服务，适用《生成式人工智能服务管理暂行办法》。调用已备案大模型的应用，可能还需要办理登记或在页面上公示所用模型的信息。
- 正式公开前，请向云服务商、模型服务商或当地网信部门确认具体要求。

---

## 项目结构

```
public/index.html      前端页面
public/vendor/         前端组件（npm run vendor 下载）
server.js              网站服务器（Node.js 18+）
lib/core.js            后端核心：校验、限流、访问码、调用模型
lib/prompt.js          提示词（只放在服务器端）
deploy/install.sh      一键部署脚本
deploy/nginx.conf      Nginx 配置模板
api/、functions/       海外部署（Vercel / Cloudflare）用，国内部署可忽略
```
