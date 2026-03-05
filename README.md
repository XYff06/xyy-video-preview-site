# xyy-video-preview-site

目前项目为**前后端一体的轻量实现**：

- 前端：首页 + 详情页 + 左侧管理后台（标签/漫剧/内容）
- 后端：Node.js 原生 HTTP 服务，提供查询与管理 API，并托管静态文件

## 功能说明

1. 首页：
   - 顶部分类胶囊按钮（默认 / hover / 选中三态）
   - 海报卡片（默认 / hover）
2. 详情页（点击某个剧集后，URL 变为 `/<name>`）：
   - 选集 tab
   - 视频预览播放器
   - 展示 `firstIngestedAt` / `updatedAt` / `videoUrl`
3. 所有页面统一左侧管理栏：
   - 标签管理：新建标签、删除标签、标签改名
   - 漫剧管理：新增漫剧、删除漫剧、漫剧改名
   - 内容管理：修改剧集集号与播放地址
4. 后端 API：
   - `GET /api/health`
   - `GET /api/ingest-records`
   - `GET /api/series?tag=...&name=...`
   - `GET /api/tags`
   - `POST /api/tags`
   - `PATCH /api/tags/:tagName`
   - `DELETE /api/tags/:tagName`
   - `POST /api/titles`
   - `PATCH /api/titles/:titleName`
   - `DELETE /api/titles/:titleName`
   - `PATCH /api/episodes`

> 当前管理操作会直接更新 `data/ingest-records.json`，便于本地演示。生产环境建议替换为数据库。

## 本地运行

### 1) 准备环境

- 安装 Node.js（建议 18+）

```bash
node --version
```

### 2) 启动服务

```bash
node server.js
```

默认监听：

- <http://localhost:4173>

### 3) 停止服务

在终端按 `Ctrl + C` 即可停止。

## 数据与建表建议

- 示例入库数据：`data/ingest-records.json`
- 推荐 PostgreSQL 建表脚本：`db/schema.sql`
