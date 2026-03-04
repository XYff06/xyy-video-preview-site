# xyy-video-preview-site

目前项目已升级为**前后端一体的轻量实现**：

- 前端：原有静态页面与交互逻辑（首页 + 详情页）
- 后端：Node.js 原生 HTTP 服务，提供 API 并托管静态文件

## 功能说明

1. 首页：
   - 顶部分类胶囊按钮（默认 / hover / 选中三态）
   - 海报卡片（默认 / hover / 选中态）
2. 详情页（点击某个剧集后，URL 变为 `/<name>`）：
   - 选集 tab
   - 视频预览播放器
   - 展示 `firstIngestedAt` / `updatedAt` / `videoUrl`
3. 后端 API：
   - `GET /api/health`
   - `GET /api/ingest-records`
   - `GET /api/series?tag=...&name=...`

## 本地运行

### 1) 准备环境

- 安装 Node.js（建议 18+）

```bash
node --version
```

### 2) 启动服务

在项目根目录执行：

```bash
node server.js
```

默认监听：

- <http://localhost:4173>

### 3) 停止服务

在终端按 `Ctrl + C` 即可停止。

## 数据位置

示例入库数据位于：

- `data/ingest-records.json`
