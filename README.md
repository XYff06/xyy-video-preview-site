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
   - 内容管理：新增剧集、修改剧集、删除剧集
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
   - `POST /api/episodes/batch-directory`（按目录批量导入）

> 当前后端已改为 PostgreSQL 持久化存储。

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


## PostgreSQL 初始化

1. 进入 psql：

```bash
psql -U postgres
```

2. 创建数据库：

```sql
CREATE DATABASE video_preview WITH ENCODING = 'UTF8';
```

3. 连接数据库：

```sql
\c video_preview
```

4. 执行建表脚本：

```sql
\i db/schema.sql
```

5. 配置环境变量（可选，默认即本地 postgres/video_preview）：

```bash
export PGHOST=127.0.0.1
export PGPORT=5432
export PGUSER=postgres
export PGPASSWORD=你的密码
export PGDATABASE=video_preview
```


6. 如果数据库开启了 SCRAM 认证，请确保设置了密码环境变量（`PGPASSWORD` 或 `POSTGRES_PASSWORD`），否则会报：`client password must be a string`。

也可以直接使用连接串：

```bash
export DATABASE_URL=postgresql://postgres:你的密码@127.0.0.1:5432/video_preview
```
