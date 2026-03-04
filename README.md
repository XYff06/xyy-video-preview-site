# xyy-video-preview-site

前端静态原型（无后端），目前做了两类页面：

1. 首页：
   - 顶部分类胶囊按钮（默认 / hover / 选中三态）
   - 海报卡片（默认 / hover / 选中态）
2. 详情页（点击某个剧集后，URL 变为 `/<name>`）：
   - 第一行：选集 tab
   - 第二行：对应集数选项卡
   - 下方：视频预览播放器

并保留业务语义演示：`固定前缀/name/序号.mp4`，以及 `firstIngestedAt` / `updatedAt` 展示。

## 部署到本地（开发机）

### 1) 准备环境
- 安装 `Python 3`（建议 3.9+）
- 确认命令可用：

```bash
python3 --version
```

### 2) 获取代码
如果你还没有项目代码，可以先克隆：

```bash
git clone <你的仓库地址>
cd xyy-video-preview-site
```

如果你已经在项目目录里，可以跳过这一步。

### 3) 启动本地静态服务
在项目根目录执行：

```bash
python3 -m http.server 4173
```

### 4) 打开网页
浏览器访问：

- <http://localhost:4173>

### 5) 停止服务
在终端按 `Ctrl + C` 即可停止。
