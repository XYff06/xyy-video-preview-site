const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT) || 4173;
const ROOT_DIR = __dirname;

function optionalEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function buildPgConfig() {
  const databaseUrl = optionalEnv('DATABASE_URL');
  if (databaseUrl) {
    return { connectionString: databaseUrl };
  }

  const passwordFromEnv = optionalEnv('PGPASSWORD') ?? optionalEnv('POSTGRES_PASSWORD');
  const config = {
    host: optionalEnv('PGHOST') || '127.0.0.1',
    port: Number(optionalEnv('PGPORT')) || 5432,
    user: optionalEnv('PGUSER') || 'postgres',
    database: optionalEnv('PGDATABASE') || 'video_preview'
  };

  if (typeof passwordFromEnv === 'string') {
    config.password = passwordFromEnv;
  }

  return config;
}

const pool = new Pool(buildPgConfig());

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

function parsePositiveInt(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return parsed;
}

function validateNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function parsePathParams(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return null;
  return decodeURIComponent(pathname.slice(prefix.length));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function normalizePathname(pathname) {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function getAllowedMethods(pathname) {
  if (pathname === '/api/health') return ['GET'];
  if (pathname === '/api/ingest-records') return ['GET'];
  if (pathname === '/api/series') return ['GET'];
  if (pathname === '/api/tags') return ['GET', 'POST'];
  if (pathname.startsWith('/api/tags/')) return ['PATCH', 'DELETE'];
  if (pathname === '/api/titles') return ['POST'];
  if (pathname.startsWith('/api/titles/')) return ['PATCH', 'DELETE'];
  if (pathname === '/api/episodes') return ['POST', 'PATCH', 'DELETE'];
  if (pathname === '/api/episodes/batch-directory') return ['POST'];
  return null;
}

function sendMethodNotAllowed(res, allowedMethods) {
  res.writeHead(405, {
    'Content-Type': MIME_TYPES['.json'],
    Allow: allowedMethods.join(', ')
  });
  res.end(JSON.stringify({ message: `Method not allowed. Allowed: ${allowedMethods.join(', ')}` }));
}

async function assignTitleTags(client, titleId, tags) {
  await client.query('DELETE FROM title_tag WHERE title_id = $1', [titleId]);
  if (!tags.length) return;

  const sql = `
    INSERT INTO title_tag(title_id, tag_id)
    SELECT $1, tag.id
    FROM tag
    WHERE tag.tag_name = ANY($2)
    ON CONFLICT DO NOTHING
  `;
  await client.query(sql, [titleId, tags]);
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

function resolveSort(sort) {
  const sortMap = {
    updated_desc: 't.updated_at DESC, t.name ASC',
    updated_asc: 't.updated_at ASC, t.name ASC',
    ingested_asc: 't.first_ingested_at ASC, t.name ASC',
    ingested_desc: 't.first_ingested_at DESC, t.name ASC',
    name_asc: 't.name ASC',
    name_desc: 't.name DESC'
  };

  return sortMap[sort] || sortMap.updated_desc;
}

const VIDEO_EXTENSION_RE = /\.(mp4|m3u8|mov|mkv|avi|flv|webm|ts|m4v)(?:$|[?#])/i;
const CHINESE_DIGIT_MAP = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9
};

function parseChineseNumber(raw) {
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  let total = 0;
  let current = 0;
  for (const ch of raw) {
    if (ch in CHINESE_DIGIT_MAP) {
      current = CHINESE_DIGIT_MAP[ch];
      continue;
    }
    if (ch === '十') {
      total += (current || 1) * 10;
      current = 0;
      continue;
    }
    if (ch === '百') {
      total += (current || 1) * 100;
      current = 0;
      continue;
    }
    if (ch === '千') {
      total += (current || 1) * 1000;
      current = 0;
      continue;
    }
    return null;
  }
  return total + current;
}

function extractEpisodeNoByText(rawText) {
  const text = String(rawText || '');
  const strictPatterns = [
    /第\s*([零〇一二两三四五六七八九十百千\d]+)\s*[集话話]/iu,
    /(?:ep|episode|e)\s*[-_.]?[\s]*0*(\d{1,4})/iu,
    /^(\d{1,4})(?:\D|$)/u
  ];

  for (const pattern of strictPatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = parseChineseNumber(match[1]);
    if (Number.isFinite(value) && value > 0) return value;
  }

  const fallback = text.match(/(\d{1,4})/u);
  if (!fallback) return null;
  const value = Number(fallback[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseDirectoryLinks(html, directoryUrl) {
  const hrefMatches = [...String(html || '').matchAll(/href\s*=\s*(["'])(.*?)\1/giu)];
  const files = [];
  for (const match of hrefMatches) {
    const rawHref = match[2].trim();
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('?')) continue;
    if (/^mailto:/i.test(rawHref) || /^javascript:/i.test(rawHref)) continue;

    let absolute;
    try {
      absolute = new URL(rawHref, directoryUrl).toString();
    } catch {
      continue;
    }

    const pathname = decodeURIComponent(new URL(absolute).pathname);
    if (pathname.endsWith('/')) continue;
    if (!VIDEO_EXTENSION_RE.test(pathname)) continue;

    const filename = pathname.split('/').pop() || '';
    const episodeNo = extractEpisodeNoByText(filename) ?? extractEpisodeNoByText(pathname);
    if (!episodeNo) continue;
    files.push({ episodeNo, videoUrl: absolute, filename });
  }

  files.sort((a, b) => a.episodeNo - b.episodeNo || a.videoUrl.localeCompare(b.videoUrl, 'zh-CN'));

  const uniqueByEpisode = new Map();
  for (const item of files) {
    if (!uniqueByEpisode.has(item.episodeNo)) {
      uniqueByEpisode.set(item.episodeNo, item);
    }
  }
  return [...uniqueByEpisode.values()];
}

async function querySeries({ tag, name, search, sort, page, pageSize }) {
  const filters = [];
  const values = [];

  if (tag) {
    values.push(tag);
    filters.push(`EXISTS (
      SELECT 1 FROM title_tag tt
      JOIN tag g ON g.id = tt.tag_id
      WHERE tt.title_id = t.id AND g.tag_name = $${values.length}
    )`);
  }
  if (name) {
    values.push(name);
    filters.push(`t.name = $${values.length}`);
  }
  if (search) {
    values.push(`%${search.trim().toLowerCase()}%`);
    filters.push(`LOWER(t.name) LIKE $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM title t
    ${whereClause}
  `;
  const countRes = await pool.query(countSql, values);
  const total = countRes.rows[0]?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const listValues = [...values, pageSize, (safePage - 1) * pageSize];
  const limitIndex = listValues.length - 1;
  const offsetIndex = listValues.length;

  const orderByClause = resolveSort(sort);

  const listSql = `
    SELECT
      t.id,
      t.name,
      t.cover_url AS poster,
      t.first_ingested_at AS "firstIngestedAt",
      t.updated_at AS "updatedAt",
      COALESCE(MAX(e.first_ingested_at), t.first_ingested_at) AS "lastNewEpisodeAt",
      COALESCE(
        ARRAY_AGG(DISTINCT g.tag_name) FILTER (WHERE g.tag_name IS NOT NULL),
        ARRAY[]::text[]
      ) AS tags,
      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'episode', e.episode_no,
            'firstIngestedAt', e.first_ingested_at,
            'updatedAt', e.updated_at,
            'videoUrl', e.episode_url
          ) ORDER BY e.episode_no
        ) FILTER (WHERE e.id IS NOT NULL),
        '[]'::json
      ) AS episodes
    FROM title t
    LEFT JOIN episode e ON e.title_id = t.id
    LEFT JOIN title_tag tt ON tt.title_id = t.id
    LEFT JOIN tag g ON g.id = tt.tag_id
    ${whereClause}
    GROUP BY t.id
    ORDER BY ${orderByClause}
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `;

  const listRes = await pool.query(listSql, listValues);
  const data = listRes.rows.map((row) => ({
    ...row,
    tags: row.tags || [],
    episodes: (row.episodes || []).map((ep) => ({
      ...ep,
      episode: Number(ep.episode)
    }))
  }));

  return {
    data,
    pagination: {
      total,
      page: safePage,
      pageSize,
      totalPages
    }
  };
}

async function getFlatIngestRecords() {
  const sql = `
    SELECT
      t.name,
      e.episode_no AS episode,
      t.cover_url AS poster,
      e.episode_url AS "videoUrl",
      e.first_ingested_at AS "firstIngestedAt",
      e.updated_at AS "updatedAt",
      COALESCE(
        ARRAY_AGG(g.tag_name ORDER BY g.sort_no, g.tag_name) FILTER (WHERE g.tag_name IS NOT NULL),
        ARRAY[]::text[]
      ) AS tags
    FROM title t
    JOIN episode e ON e.title_id = t.id
    LEFT JOIN title_tag tt ON tt.title_id = t.id
    LEFT JOIN tag g ON g.id = tt.tag_id
    GROUP BY t.id, e.id
    ORDER BY t.name, e.episode_no
  `;
  const { rows } = await pool.query(sql);
  return rows.map((r) => ({ ...r, episode: Number(r.episode), tags: r.tags || [] }));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = normalizePathname(url.pathname);

  try {
    if (pathname === '/api/health' && req.method === 'GET') {
      await pool.query('SELECT 1');
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (pathname === '/api/ingest-records' && req.method === 'GET') {
      sendJson(res, 200, { data: await getFlatIngestRecords() });
      return;
    }

    if (pathname === '/api/series' && req.method === 'GET') {
      const payload = await querySeries({
        tag: url.searchParams.get('tag'),
        name: url.searchParams.get('name'),
        search: url.searchParams.get('search'),
        sort: url.searchParams.get('sort'),
        page: parsePositiveInt(url.searchParams.get('page'), 1),
        pageSize: parsePositiveInt(url.searchParams.get('pageSize'), 25)
      });
      sendJson(res, 200, payload);
      return;
    }

    if (pathname === '/api/tags' && req.method === 'GET') {
      const { rows } = await pool.query('SELECT tag_name FROM tag ORDER BY sort_no ASC, tag_name ASC');
      sendJson(res, 200, { data: rows.map((r) => r.tag_name) });
      return;
    }

    if (pathname === '/api/tags' && req.method === 'POST') {
      const body = await readBody(req);
      if (!validateNonEmptyString(body.tagName)) return sendJson(res, 400, { message: 'tagName 不能为空' });
      const tagName = body.tagName.trim();
      try {
        await pool.query('INSERT INTO tag(tag_name) VALUES ($1)', [tagName]);
      } catch (e) {
        if (e.code === '23505') return sendJson(res, 409, { message: '标签已存在' });
        throw e;
      }
      sendJson(res, 201, { message: '标签已创建，请为剧集分配此标签', data: tagName });
      return;
    }

    const tagName = parsePathParams(pathname, '/api/tags/');
    if (tagName !== null && req.method === 'PATCH') {
      const body = await readBody(req);
      if (!validateNonEmptyString(body.newTagName)) return sendJson(res, 400, { message: 'newTagName 不能为空' });
      const newTagName = body.newTagName.trim();
      const result = await pool.query('UPDATE tag SET tag_name = $2 WHERE tag_name = $1', [tagName, newTagName]);
      if (!result.rowCount) return sendJson(res, 404, { message: '标签不存在' });
      sendJson(res, 200, { message: '标签改名成功' });
      return;
    }

    if (tagName !== null && req.method === 'DELETE') {
      const result = await pool.query('DELETE FROM tag WHERE tag_name = $1', [tagName]);
      if (!result.rowCount) return sendJson(res, 404, { message: '标签不存在' });
      sendJson(res, 200, { message: '标签已删除' });
      return;
    }

    if (pathname === '/api/titles' && req.method === 'POST') {
      const body = await readBody(req);
      if (!validateNonEmptyString(body.name) || !validateNonEmptyString(body.poster)) {
        return sendJson(res, 400, { message: 'name 和 poster 不能为空' });
      }
      const name = body.name.trim();
      const poster = body.poster.trim();
      const tags = Array.isArray(body.tags) ? body.tags.filter(validateNonEmptyString).map((s) => s.trim()) : [];
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const titleInsert = await client.query(
          'INSERT INTO title(name, cover_url) VALUES ($1, $2) RETURNING id',
          [name, poster]
        );
        const titleId = titleInsert.rows[0].id;
        await assignTitleTags(client, titleId, tags);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') return sendJson(res, 409, { message: '漫剧名称已存在' });
        throw e;
      } finally {
        client.release();
      }
      sendJson(res, 201, { message: '漫剧已创建' });
      return;
    }

    const titleName = parsePathParams(pathname, '/api/titles/');
    if (titleName !== null && req.method === 'PATCH') {
      const body = await readBody(req);
      if (!validateNonEmptyString(body.newName) || !validateNonEmptyString(body.poster) || !Array.isArray(body.tags)) {
        return sendJson(res, 400, { message: 'newName、poster、tags 参数不完整' });
      }
      const newName = body.newName.trim();
      const poster = body.poster.trim();
      const tags = body.tags.filter(validateNonEmptyString).map((s) => s.trim());
      if (!tags.length) return sendJson(res, 400, { message: 'tags 至少需要一个标签' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const titleRes = await client.query('SELECT id FROM title WHERE name = $1', [titleName]);
        if (!titleRes.rowCount) {
          await client.query('ROLLBACK');
          return sendJson(res, 404, { message: '漫剧不存在' });
        }
        const titleId = titleRes.rows[0].id;
        await client.query('UPDATE title SET name = $2, cover_url = $3 WHERE id = $1', [titleId, newName, poster]);

        await assignTitleTags(client, titleId, tags);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') return sendJson(res, 409, { message: '目标名称已存在' });
        throw e;
      } finally {
        client.release();
      }
      sendJson(res, 200, { message: '漫剧信息修改成功' });
      return;
    }

    if (titleName !== null && req.method === 'DELETE') {
      const result = await pool.query('DELETE FROM title WHERE name = $1', [titleName]);
      if (!result.rowCount) return sendJson(res, 404, { message: '漫剧不存在' });
      sendJson(res, 200, { message: '漫剧删除成功' });
      return;
    }

    if (pathname === '/api/episodes/batch-directory' && req.method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      const poster = String(body.poster || '').trim();
      const directoryUrl = String(body.directoryUrl || '').trim();
      const tags = Array.isArray(body.tags) ? body.tags.filter(validateNonEmptyString).map((s) => s.trim()) : [];

      if (!name || !poster || !directoryUrl) {
        return sendJson(res, 400, { message: 'name、poster、directoryUrl 不能为空' });
      }
      if (!tags.length) {
        return sendJson(res, 400, { message: 'tags 至少需要一个标签' });
      }

      let parsedDirectoryUrl;
      try {
        parsedDirectoryUrl = new URL(directoryUrl);
      } catch {
        return sendJson(res, 400, { message: 'directoryUrl 不是合法 URL' });
      }

      if (!/^https?:$/i.test(parsedDirectoryUrl.protocol)) {
        return sendJson(res, 400, { message: 'directoryUrl 只支持 http/https' });
      }

      const directoryResponse = await fetch(parsedDirectoryUrl.toString());
      if (!directoryResponse.ok) {
        return sendJson(res, 400, { message: `读取目录失败：HTTP ${directoryResponse.status}` });
      }

      const contentType = directoryResponse.headers.get('content-type') || '';
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        return sendJson(res, 400, { message: '目录地址返回的不是 HTML 页面，无法解析视频列表' });
      }

      const directoryHtml = await directoryResponse.text();
      const parsedEpisodes = parseDirectoryLinks(directoryHtml, parsedDirectoryUrl.toString());
      if (!parsedEpisodes.length) {
        return sendJson(res, 400, {
          message: '目录中未识别到可导入的视频文件。请确认链接可直接访问且文件名包含集号（如第1集/第一集/EP01）。'
        });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        let titleId;
        const existingTitleRes = await client.query('SELECT id FROM title WHERE name = $1', [name]);
        if (existingTitleRes.rowCount) {
          titleId = existingTitleRes.rows[0].id;
          await client.query('UPDATE title SET cover_url = $2 WHERE id = $1', [titleId, poster]);
        } else {
          const titleInsert = await client.query(
            'INSERT INTO title(name, cover_url) VALUES ($1, $2) RETURNING id',
            [name, poster]
          );
          titleId = titleInsert.rows[0].id;
        }

        const tagRows = await client.query('SELECT id, tag_name FROM tag WHERE tag_name = ANY($1)', [tags]);
        if (!tagRows.rowCount) {
          await client.query('ROLLBACK');
          return sendJson(res, 400, { message: '所选标签不存在，请先创建标签' });
        }

        await assignTitleTags(client, titleId, tags);

        const episodeNos = parsedEpisodes.map((episode) => episode.episodeNo);
        const episodeUrls = parsedEpisodes.map((episode) => episode.videoUrl);
        const upsertSql = `
          WITH input AS (
            SELECT *
            FROM UNNEST($2::int[], $3::text[]) AS u(episode_no, episode_url)
          ),
          inserted AS (
            INSERT INTO episode(title_id, episode_no, episode_url)
            SELECT $1, i.episode_no, i.episode_url
            FROM input i
            ON CONFLICT (title_id, episode_no) DO NOTHING
            RETURNING episode_no
          ),
          updated AS (
            UPDATE episode e
            SET episode_url = i.episode_url
            FROM input i
            WHERE e.title_id = $1
              AND e.episode_no = i.episode_no
              AND NOT EXISTS (SELECT 1 FROM inserted ins WHERE ins.episode_no = i.episode_no)
            RETURNING e.episode_no
          )
          SELECT
            (SELECT COUNT(*)::int FROM inserted) AS inserted,
            (SELECT COUNT(*)::int FROM updated) AS updated
        `;
        const upsertRes = await client.query(upsertSql, [titleId, episodeNos, episodeUrls]);
        const inserted = upsertRes.rows[0]?.inserted ?? 0;
        const updated = upsertRes.rows[0]?.updated ?? 0;

        await client.query('COMMIT');
        sendJson(res, 201, {
          message: `批量导入完成，共识别 ${parsedEpisodes.length} 集`,
          data: {
            total: parsedEpisodes.length,
            inserted,
            updated,
            episodes: parsedEpisodes.map((item) => ({ episodeNo: item.episodeNo, videoUrl: item.videoUrl }))
          }
        });
      } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') return sendJson(res, 409, { message: '漫剧名称冲突，请更换名称' });
        throw e;
      } finally {
        client.release();
      }
      return;
    }


    if (pathname === '/api/episodes' && req.method === 'POST') {
      const body = await readBody(req);
      const episodeTitleName = String(body.titleName || '').trim();
      const episodeNo = Number(body.episodeNo);
      const videoUrl = String(body.videoUrl || '').trim();
      if (!episodeTitleName || Number.isNaN(episodeNo) || !videoUrl) return sendJson(res, 400, { message: '参数不完整' });
      if (episodeNo <= 0) return sendJson(res, 400, { message: '集号必须大于0' });

      const titleRes = await pool.query('SELECT id FROM title WHERE name = $1', [episodeTitleName]);
      if (!titleRes.rowCount) return sendJson(res, 404, { message: '漫剧不存在' });
      try {
        await pool.query('INSERT INTO episode(title_id, episode_no, episode_url) VALUES ($1, $2, $3)', [titleRes.rows[0].id, episodeNo, videoUrl]);
      } catch (e) {
        if (e.code === '23505') return sendJson(res, 409, { message: '目标集号已存在' });
        throw e;
      }
      sendJson(res, 201, { message: '剧集新增成功' });
      return;
    }

    if (pathname === '/api/episodes' && req.method === 'PATCH') {
      const body = await readBody(req);
      const episodeTitleName = String(body.titleName || '').trim();
      const sourceNo = Number(body.episodeNo);
      const targetNo = Number(body.newEpisodeNo);
      const videoUrl = String(body.videoUrl || '').trim();
      if (!episodeTitleName || Number.isNaN(sourceNo) || Number.isNaN(targetNo) || !videoUrl) return sendJson(res, 400, { message: '参数不完整' });
      if (sourceNo <= 0 || targetNo <= 0) return sendJson(res, 400, { message: '集号必须大于0' });

      const sql = `
        UPDATE episode e
        SET episode_no = $3, episode_url = $4
        FROM title t
        WHERE e.title_id = t.id AND t.name = $1 AND e.episode_no = $2
      `;
      try {
        const result = await pool.query(sql, [episodeTitleName, sourceNo, targetNo, videoUrl]);
        if (!result.rowCount) return sendJson(res, 404, { message: '剧集不存在' });
      } catch (e) {
        if (e.code === '23505') return sendJson(res, 409, { message: '目标集号已存在' });
        throw e;
      }
      sendJson(res, 200, { message: '剧集信息修改成功' });
      return;
    }

    if (pathname === '/api/episodes' && req.method === 'DELETE') {
      const body = await readBody(req);
      const episodeTitleName = String(body.titleName || '').trim();
      const episodeNo = Number(body.episodeNo);
      if (!episodeTitleName || Number.isNaN(episodeNo)) return sendJson(res, 400, { message: '参数不完整' });
      if (episodeNo <= 0) return sendJson(res, 400, { message: '集号必须大于0' });

      const result = await pool.query(
        'DELETE FROM episode e USING title t WHERE e.title_id = t.id AND t.name = $1 AND e.episode_no = $2',
        [episodeTitleName, episodeNo]
      );
      if (!result.rowCount) return sendJson(res, 404, { message: '剧集不存在' });
      sendJson(res, 200, { message: '剧集删除成功' });
      return;
    }

    if (pathname.startsWith('/api/')) {
      const allowedMethods = getAllowedMethods(pathname);
      if (req.method === 'OPTIONS') {
        if (allowedMethods) {
          res.writeHead(204, { Allow: allowedMethods.join(', ') });
          res.end();
          return;
        }
        sendJson(res, 404, { message: 'API endpoint not found.' });
        return;
      }

      if (allowedMethods) {
        sendMethodNotAllowed(res, allowedMethods);
        return;
      }

      sendJson(res, 404, { message: 'API endpoint not found.' });
      return;
    }

    if (req.method === 'GET') {
      serveStatic(pathname, res);
      return;
    }

    sendJson(res, 405, { message: 'Method not allowed.' });
  } catch (error) {
    const message = error?.message || 'Internal server error';
    if (message.includes('SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string')) {
      sendJson(res, 500, {
        message: '数据库认证失败：当前 PostgreSQL 使用 SCRAM 且未提供有效密码。请设置 PGPASSWORD（或 POSTGRES_PASSWORD / DATABASE_URL）后重启服务。'
      });
      return;
    }
    sendJson(res, 500, { message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Server listening at http://${HOST}:${PORT}`);
});
