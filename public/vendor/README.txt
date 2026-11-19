这个目录存放网页用到的前端组件（PDF 解析、Markdown 渲染、框图绘制）。

在项目根目录运行一次：

    npm run vendor

就会从 npmmirror（阿里云镜像）下载以下文件到这里，网站之后不再依赖任何外部 CDN：

    pdf.min.js、pdf.worker.min.js、cmaps/（中文 PDF 文字提取需要）
    marked.min.js、purify.min.js、mermaid.min.js

deploy/install.sh 会自动执行这一步。
