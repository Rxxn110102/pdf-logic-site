把以下文件放到这个目录后，网站将优先使用本地文件，不依赖外部 CDN：

pdf.min.js        https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js
pdf.worker.min.js https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js
marked.min.js     https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js
purify.min.js     https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js
mermaid.min.js    https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js

也可以在项目根目录运行：npm run vendor
