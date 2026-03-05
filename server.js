const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT) || 4173;
const VIDEO_PREFIX = process.env.VIDEO_PREFIX || 'https://cdn.example.com/videos';
const ROOT_DIR = __dirname;
const DATA_FILE = path.join(ROOT_DIR, 'data', 'ingest-records.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': MIME_TYPES['.json'] });
  res.end(JSON.stringify(data));
}

function toVideoUrl(name, episode) {
  return `${VIDEO_PREFIX}/${encodeURIComponent(name)}/${episode}.mp4`;
}

function buildSeries(records) {
  const map = new Map();
  records.forEach((rec) => {
    if (!map.has(rec.name)) {
      map.set(rec.name, { name: rec.name, tags: new Set(), episodes: [], poster: rec.poster });
    }

    const series = map.get(rec.name);
    rec.tags.forEach((tag) => series.tags.add(tag));
    series.episodes.push({
      episode: rec.episode,
      firstIngestedAt: rec.firstIngestedAt,
      updatedAt: rec.updatedAt,
      videoUrl: rec.videoUrl || toVideoUrl(rec.name, rec.episode)
    });
  });

  for (const series of map.values()) {
    series.episodes.sort((a, b) => a.episode - b.episode);
    const latestEpisode = series.episodes[series.episodes.length - 1];
    series.lastNewEpisodeAt = latestEpisode.firstIngestedAt;
    series.firstIngestedAt = series.episodes.map((ep) => ep.firstIngestedAt).sort()[0];
    series.updatedAt = series.episodes.map((ep) => ep.updatedAt).sort().at(-1);
    series.tags = [...series.tags];
  }

  return [...map.values()].sort((a, b) => new Date(b.lastNewEpisodeAt) - new Date(a.lastNewEpisodeAt));
}

function getIngestRecords() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveIngestRecords(records) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf8');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function parsePathParams(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return null;
  return decodeURIComponent(pathname.slice(prefix.length));
}

function validateNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function serveStatic(reqPath, res) {
  const unsafePath = reqPath === '/' ? '/index.html' : reqPath;
  const normalizedPath = path.normalize(unsafePath).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(ROOT_DIR, normalizedPath);

  if (!filePath.startsWith(ROOT_DIR)) {
    sendJson(res, 400, { message: 'Invalid path.' });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (!err) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(data);
      return;
    }

    fs.readFile(path.join(ROOT_DIR, 'index.html'), (indexErr, indexData) => {
      if (indexErr) {
        sendJson(res, 500, { message: 'Failed to read index.html.' });
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
      res.end(indexData);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname === '/api/health' && req.method === 'GET') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (url.pathname === '/api/ingest-records' && req.method === 'GET') {
      sendJson(res, 200, { data: getIngestRecords() });
      return;
    }

    if (url.pathname === '/api/series' && req.method === 'GET') {
      const records = getIngestRecords();
      const seriesList = buildSeries(records);
      const tag = url.searchParams.get('tag');
      const name = url.searchParams.get('name');

      let data = seriesList;
      if (tag) {
        data = data.filter((series) => series.tags.includes(tag));
      }
      if (name) {
        data = data.filter((series) => series.name === name);
      }

      sendJson(res, 200, { data });
      return;
    }

    if (url.pathname === '/api/tags' && req.method === 'GET') {
      const tags = [...new Set(getIngestRecords().flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
      sendJson(res, 200, { data: tags });
      return;
    }

    if (url.pathname === '/api/tags' && req.method === 'POST') {
      const body = await readBody(req);
      if (!validateNonEmptyString(body.tagName)) {
        sendJson(res, 400, { message: 'tagName 不能为空' });
        return;
      }
      const newTag = body.tagName.trim();
      const records = getIngestRecords();
      const exists = records.some((record) => record.tags.includes(newTag));
      if (exists) {
        sendJson(res, 409, { message: '标签已存在' });
        return;
      }
      sendJson(res, 201, { message: '标签已创建，请为剧集分配此标签', data: newTag });
      return;
    }

    const tagName = parsePathParams(url.pathname, '/api/tags/');
    if (tagName !== null && req.method === 'PATCH') {
      const body = await readBody(req);
      if (!validateNonEmptyString(body.newTagName)) {
        sendJson(res, 400, { message: 'newTagName 不能为空' });
        return;
      }
      const newTagName = body.newTagName.trim();
      const records = getIngestRecords();
      const hasOld = records.some((record) => record.tags.includes(tagName));
      if (!hasOld) {
        sendJson(res, 404, { message: '标签不存在' });
        return;
      }
      if (records.some((record) => record.tags.includes(newTagName))) {
        sendJson(res, 409, { message: '目标标签名已存在' });
        return;
      }
      records.forEach((record) => {
        record.tags = record.tags.map((tag) => (tag === tagName ? newTagName : tag));
        record.updatedAt = new Date().toISOString();
      });
      saveIngestRecords(records);
      sendJson(res, 200, { message: '标签改名成功' });
      return;
    }

    if (tagName !== null && req.method === 'DELETE') {
      const records = getIngestRecords();
      const hasOld = records.some((record) => record.tags.includes(tagName));
      if (!hasOld) {
        sendJson(res, 404, { message: '标签不存在' });
        return;
      }
      records.forEach((record) => {
        record.tags = record.tags.filter((tag) => tag !== tagName);
        record.updatedAt = new Date().toISOString();
      });
      saveIngestRecords(records);
      sendJson(res, 200, { message: '标签已删除' });
      return;
    }

    if (url.pathname === '/api/titles' && req.method === 'POST') {
      const body = await readBody(req);
      if (!validateNonEmptyString(body.name) || !validateNonEmptyString(body.poster)) {
        sendJson(res, 400, { message: 'name 和 poster 不能为空' });
        return;
      }
      const name = body.name.trim();
      const poster = body.poster.trim();
      const tags = Array.isArray(body.tags) ? body.tags.filter(validateNonEmptyString).map((s) => s.trim()) : [];
      const records = getIngestRecords();
      if (records.some((record) => record.name === name)) {
        sendJson(res, 409, { message: '漫剧名称已存在' });
        return;
      }
      const now = new Date().toISOString();
      records.push({ name, episode: 1, tags, firstIngestedAt: now, updatedAt: now, poster, videoUrl: toVideoUrl(name, 1) });
      saveIngestRecords(records);
      sendJson(res, 201, { message: '漫剧已创建（默认含第1集）' });
      return;
    }

    const titleName = parsePathParams(url.pathname, '/api/titles/');
    if (titleName !== null && req.method === 'PATCH') {
      const body = await readBody(req);
      if (!validateNonEmptyString(body.newName) || !validateNonEmptyString(body.poster) || !Array.isArray(body.tags)) {
        sendJson(res, 400, { message: 'newName、poster、tags 参数不完整' });
        return;
      }
      const newName = body.newName.trim();
      const poster = body.poster.trim();
      const tags = body.tags.filter(validateNonEmptyString).map((s) => s.trim());
      if (!tags.length) {
        sendJson(res, 400, { message: 'tags 至少需要一个标签' });
        return;
      }
      const records = getIngestRecords();
      const hasTitle = records.some((record) => record.name === titleName);
      if (!hasTitle) {
        sendJson(res, 404, { message: '漫剧不存在' });
        return;
      }
      if (records.some((record) => record.name === newName && record.name !== titleName)) {
        sendJson(res, 409, { message: '目标名称已存在' });
        return;
      }
      records.forEach((record) => {
        if (record.name === titleName) {
          record.name = newName;
          record.poster = poster;
          record.tags = [...tags];
          record.updatedAt = new Date().toISOString();
          if (!record.videoUrl || record.videoUrl.includes(encodeURIComponent(titleName))) {
            record.videoUrl = toVideoUrl(newName, record.episode);
          }
        }
      });
      saveIngestRecords(records);
      sendJson(res, 200, { message: '漫剧信息修改成功' });
      return;
    }

    if (titleName !== null && req.method === 'DELETE') {
      const records = getIngestRecords();
      const next = records.filter((record) => record.name !== titleName);
      if (next.length === records.length) {
        sendJson(res, 404, { message: '漫剧不存在' });
        return;
      }
      saveIngestRecords(next);
      sendJson(res, 200, { message: '漫剧删除成功' });
      return;
    }

    if (url.pathname === '/api/episodes' && req.method === 'PATCH') {
      const body = await readBody(req);
      const { titleName: episodeTitleName, episodeNo, newEpisodeNo, videoUrl } = body;
      if (!validateNonEmptyString(episodeTitleName) || Number.isNaN(Number(episodeNo)) || Number.isNaN(Number(newEpisodeNo)) || !validateNonEmptyString(videoUrl)) {
        sendJson(res, 400, { message: '参数不完整' });
        return;
      }

      const sourceNo = Number(episodeNo);
      const targetNo = Number(newEpisodeNo);
      if (sourceNo <= 0 || targetNo <= 0) {
        sendJson(res, 400, { message: '集号必须大于0' });
        return;
      }

      const records = getIngestRecords();
      const target = records.find((record) => record.name === episodeTitleName && record.episode === sourceNo);
      if (!target) {
        sendJson(res, 404, { message: '剧集不存在' });
        return;
      }

      const duplicated = records.find((record) => record.name === episodeTitleName && record.episode === targetNo && record !== target);
      if (duplicated) {
        sendJson(res, 409, { message: '目标集号已存在' });
        return;
      }

      target.episode = targetNo;
      target.videoUrl = videoUrl.trim();
      target.updatedAt = new Date().toISOString();
      saveIngestRecords(records);
      sendJson(res, 200, { message: '剧集信息修改成功' });
      return;
    }

    if (req.method === 'GET') {
      serveStatic(url.pathname, res);
      return;
    }

    sendJson(res, 405, { message: 'Method not allowed.' });
  } catch (error) {
    sendJson(res, 500, { message: error.message || 'Internal server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Server listening at http://${HOST}:${PORT}`);
});
