const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT) || 4173;
const VIDEO_PREFIX = process.env.VIDEO_PREFIX || 'https://cdn.example.com/videos';
const ROOT_DIR = __dirname;

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
      videoUrl: toVideoUrl(rec.name, rec.episode)
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
  const file = path.join(ROOT_DIR, 'data', 'ingest-records.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method !== 'GET') {
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  if (url.pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (url.pathname === '/api/ingest-records') {
    sendJson(res, 200, { data: getIngestRecords() });
    return;
  }

  if (url.pathname === '/api/series') {
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

  serveStatic(url.pathname, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Server listening at http://${HOST}:${PORT}`);
});
