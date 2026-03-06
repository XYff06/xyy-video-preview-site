# xyy-video-preview-site

一个前后端一体的轻量视频预览站点：

- 前端：分类筛选、搜索、排序、分页、详情播放、选集切换。
- 后端：Node.js 原生 HTTP 服务（无 Express），提供查询与管理 API。
- 数据层：PostgreSQL 持久化存储。

---

## 1. 功能概览

### 首页
- 标签筛选（顶部分类胶囊）
- 关键字搜索
- 排序（按更新时间、入库时间、名称）
- 分页浏览
- 海报卡片点击进入详情

### 详情页
- 视频播放器预览
- 选集区：**单行 10 个**，左右三角按钮切换上一页/下一页
- 展示剧集元信息：`firstIngestedAt` / `updatedAt` / `videoUrl`

### 管理功能（右侧“管理”按钮）
- 标签管理：新增 / 修改 / 删除
- 漫剧管理：新增 / 修改 / 删除
- 内容管理：新增单集、批量导入、修改、删除

---

## 2. 技术栈与运行要求

- Node.js：建议 `>= 18`
- PostgreSQL：建议 `>= 13`
- npm：随 Node.js 安装

检查版本：

```bash
node -v
npm -v
psql --version
```

---

## 3. 快速开始

### 3.1 安装依赖

```bash
npm install
```

### 3.2 初始化数据库（从终端到建表成功）

按下面步骤操作即可：

1) 进入 PostgreSQL 终端：

```bash
psql -U postgres
```

2) 在 `psql` 中创建数据库：

```sql
CREATE DATABASE video_preview WITH ENCODING = 'UTF8';
```

3) 切换到新库并导入建表脚本：

```sql
\c video_preview
\i db/schema.sql
```

4) 验证表是否创建成功（看到表列表即可）：

```sql
\dt
```

> 说明：如果你是在项目根目录外进入 `psql`，`\i db/schema.sql` 可能找不到文件。可改用绝对路径，例如 `\i /workspace/xyy-video-preview-site/db/schema.sql`。

### 3.3 使用配置文件管理环境变量（推荐）

为了避免每次手动 `export`，项目支持在根目录使用 `.env` 文件。启动时会自动读取（系统环境变量优先）。

1) 新建 `.env` 文件（可从 `.env.example` 复制）：

```bash
cp .env.example .env
```

2) 按需修改 `.env`：

```dotenv
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=postgres
PGPASSWORD=你的数据库密码
PGDATABASE=video_preview
PORT=4173
# 或使用连接串（设置后优先于上面的分项配置）
# DATABASE_URL=postgresql://postgres:你的数据库密码@127.0.0.1:5432/video_preview
```

服务端会读取以下变量（优先级见下一节）：

- `DATABASE_URL`
- `PGHOST`
- `PGPORT`
- `PGUSER`
- `PGPASSWORD`（或 `POSTGRES_PASSWORD`）
- `PGDATABASE`
- `PORT`（服务端口，默认 `4173`）

### 3.4 启动项目

```bash
npm start
```

启动后访问：

- <http://localhost:4173>

停止服务：终端 `Ctrl + C`

---

## 4. 数据库连接规则（很重要）

后端连接逻辑：

1. 若设置了 `DATABASE_URL`，优先使用连接串。
2. 否则使用分项配置：
   - `PGHOST`（默认 `127.0.0.1`）
   - `PGPORT`（默认 `5432`）
   - `PGUSER`（默认 `postgres`）
   - `PGDATABASE`（默认 `video_preview`）
   - 密码来自 `PGPASSWORD` 或 `POSTGRES_PASSWORD`

如果 PostgreSQL 启用了密码认证（常见），请务必设置 `PGPASSWORD`（或连接串里带密码），否则可能连接失败。

---

## 5. 常用 API（简表）

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

可通过 `curl` 自检：

```bash
curl http://localhost:4173/api/health
```

---

## 6. 常见问题排查

### 6.1 `connect ECONNREFUSED 127.0.0.1:5432`
表示应用连不上本机 PostgreSQL。请检查：

- PostgreSQL 服务是否已启动
- 端口是否是 `5432`（或修改 `PGPORT`）
- `PGHOST` / `PGUSER` / `PGDATABASE` 是否正确

### 6.2 `password authentication failed for user ...`
用户名或密码不正确，请重新设置：

- `PGUSER`
- `PGPASSWORD`

### 6.3 `client password must be a string`
通常是开启密码认证但未传密码。设置 `PGPASSWORD` 或 `DATABASE_URL` 即可。

### 6.4 Windows 设置了变量但不生效
常见原因：

- 在一个终端里 `set`，却在另一个终端里执行 `npm start`
- 把 PowerShell 写法和 CMD 写法混用

建议：**在同一个终端窗口中设置变量并立即启动服务**。

---

## 7. 项目结构

```text
.
├─ app.js                 # 前端交互逻辑
├─ styles.css             # 前端样式
├─ index.html             # 页面模板
├─ server.js              # Node HTTP + API + 静态资源
├─ desktop_admin/
│  └─ qt_admin.py         # Python + PyQt5 管理端（调用现有 API）
├─ db/
│  └─ schema.sql          # PostgreSQL 建表脚本
└─ data/
   └─ ingest-records.json # 示例数据
```

---

## 8. Qt5 管理端（新增）

为便于后续将管理模块迁移到桌面端，项目新增了一个 Python + PyQt5 的管理工具：

- 文件路径：`desktop_admin/qt_admin.py`
- 默认 API 地址：`http://127.0.0.1:4173`
- 功能覆盖：标签管理、漫剧管理、剧集管理（新增/修改/删除/批量导入目录）

### 8.1 安装依赖

```bash
python3 -m pip install PyQt5 requests
```

### 8.2 启动

```bash
python3 desktop_admin/qt_admin.py
```

启动后可在窗口顶部修改 API Base URL，并通过“测试连接”确认服务可用。
