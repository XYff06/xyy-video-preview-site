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

### 3.2 初始化数据库

1) 创建数据库（示例名：`video_preview`）：

```sql
CREATE DATABASE video_preview WITH ENCODING = 'UTF8';
```

2) 导入建表脚本：

```bash
psql -U postgres -d video_preview -f db/schema.sql
```

> 如果你已进入 `psql` 交互终端，也可以用：
>
> ```sql
> \c video_preview
> \i db/schema.sql
> ```

### 3.3 配置环境变量（重点）

服务端读取以下变量（优先级见下一节）：

- `DATABASE_URL`
- `PGHOST`
- `PGPORT`
- `PGUSER`
- `PGPASSWORD`（或 `POSTGRES_PASSWORD`）
- `PGDATABASE`
- `PORT`（服务端口，默认 `4173`）

#### macOS / Linux（bash/zsh）

```bash
export PGHOST=127.0.0.1
export PGPORT=5432
export PGUSER=postgres
export PGPASSWORD=你的数据库密码
export PGDATABASE=video_preview
export PORT=4173
```

或使用连接串：

```bash
export DATABASE_URL='postgresql://postgres:你的数据库密码@127.0.0.1:5432/video_preview'
```

#### Windows PowerShell

```powershell
$env:PGHOST = "127.0.0.1"
$env:PGPORT = "5432"
$env:PGUSER = "postgres"
$env:PGPASSWORD = "你的数据库密码"
$env:PGDATABASE = "video_preview"
$env:PORT = "4173"
```

连接串写法：

```powershell
$env:DATABASE_URL = "postgresql://postgres:你的数据库密码@127.0.0.1:5432/video_preview"
```

#### Windows CMD

```cmd
set PGHOST=127.0.0.1
set PGPORT=5432
set PGUSER=postgres
set PGPASSWORD=你的数据库密码
set PGDATABASE=video_preview
set PORT=4173
```

连接串写法：

```cmd
set DATABASE_URL=postgresql://postgres:你的数据库密码@127.0.0.1:5432/video_preview
```

> 注意：以上 `set` / `$env:` 仅对当前终端会话生效。若想长期生效，可在系统环境变量中配置。

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
├─ db/
│  └─ schema.sql          # PostgreSQL 建表脚本
└─ data/
   └─ ingest-records.json # 示例数据
```
