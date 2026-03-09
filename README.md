# xyy-video-preview-site

一个前后端分离职责更清晰的轻量视频预览站点：

- 前端：`index.html + app.ts + styles.css`，只负责 UI 展示与交互；构建产物输出到 `dist/app.js`（不再维护根目录 `app.js`）。
- 后端：Flask API 服务，负责查询、管理、批量导入等业务逻辑。
- 数据层：PostgreSQL 持久化存储。

---

## 1. 主要能力

- 首页：标签筛选、搜索、排序、分页。
- 详情页：视频播放、选集分页（每页 10 集）。
- 管理端弹窗：标签管理、漫剧管理、内容管理（单集 + 批量导入目录）。

---

## 2. 运行环境

- Python `>= 3.10`
- PostgreSQL `>= 13`

检查版本：

```bash
python3 --version
psql --version
```

---

## 3. 快速开始

### 3.1 安装依赖

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3.2 初始化数据库

```bash
psql -U postgres
CREATE DATABASE video_preview WITH ENCODING = 'UTF8';
\c video_preview
\i db/schema.sql
\dt
```

### 3.3 配置环境变量

```bash
cp .env.example .env
```

`.env` 示例：

```dotenv
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=postgres
PGPASSWORD=你的数据库密码
PGDATABASE=video_preview
PORT=4173
# DATABASE_URL=postgresql://postgres:你的数据库密码@127.0.0.1:5432/video_preview
```

后端读取优先级：

1. `DATABASE_URL`
2. 分项配置（`PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`）

### 3.4 启动服务

```bash
python app.py
```

访问：<http://localhost:4173>

---

## 4. API 简表

- `GET /api/health`
- `GET /api/series`
- `GET /api/tags`
- `POST /api/tags`
- `PATCH /api/tags/:tagName`
- `DELETE /api/tags/:tagName`
- `POST /api/titles`
- `PATCH /api/titles/:titleName`
- `DELETE /api/titles/:titleName`
- `POST /api/episodes`
- `PATCH /api/episodes`
- `DELETE /api/episodes`
- `POST /api/episodes/batch-directory`
- `GET /api/ingest-records`

> 说明：`POST /api/episodes/batch-directory` 在访问目录 URL 失败（如超时、DNS 失败、连接拒绝）时，会返回 `400` 和明确错误类型，避免直接抛出 `500`。

快速自检：

```bash
curl http://localhost:4173/api/health
```

如果批量导入目录失败，可先自检目录地址：

```bash
curl -I "你的 directoryUrl"
```

---

## 5. 项目结构

```text
.
├─ app.py                # Flask API + 静态资源入口
├─ app.ts                # 前端交互逻辑（TypeScript 源码）
├─ dist/app.js           # TypeScript 构建输出（浏览器加载）
├─ styles.css            # 前端样式
├─ index.html            # 页面模板
├─ requirements.txt      # Python 依赖
└─ db/
   └─ schema.sql         # PostgreSQL 建表脚本
```
