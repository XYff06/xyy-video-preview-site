import os
import re
from contextlib import contextmanager
from urllib.parse import urlparse, unquote

import psycopg2
import psycopg2.extras
import requests
from flask import Flask, jsonify, request, send_from_directory

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))


def load_env_file(file_path: str) -> None:
    if not os.path.exists(file_path):
        return
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            trimmed = line.strip()
            if not trimmed or trimmed.startswith('#') or '=' not in trimmed:
                continue
            key, value = trimmed.split('=', 1)
            key = key.strip()
            if not key or key in os.environ:
                continue
            value = value.strip().strip('"').strip("'")
            os.environ[key] = value


load_env_file(os.path.join(ROOT_DIR, '.env'))


VIDEO_EXTENSION_RE = re.compile(r'\.(mp4|m3u8|mov|mkv|avi|flv|webm|ts|m4v)(?:$|[?#])', re.I)
CHINESE_DIGIT_MAP = {'零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9}


def optional_env(name: str):
    value = os.environ.get(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


def get_db_config():
    database_url = optional_env('DATABASE_URL')
    if database_url:
        return {'dsn': database_url}
    return {
        'host': optional_env('PGHOST') or '127.0.0.1',
        'port': int(optional_env('PGPORT') or '5432'),
        'user': optional_env('PGUSER') or 'postgres',
        'password': optional_env('PGPASSWORD') or optional_env('POSTGRES_PASSWORD'),
        'dbname': optional_env('PGDATABASE') or 'video_preview',
    }


DB_CONFIG = get_db_config()


@contextmanager
def get_conn():
    if 'dsn' in DB_CONFIG:
        conn = psycopg2.connect(DB_CONFIG['dsn'])
    else:
        kwargs = {k: v for k, v in DB_CONFIG.items() if v is not None}
        conn = psycopg2.connect(**kwargs)
    try:
        yield conn
    finally:
        conn.close()


def parse_positive_int(value, default, max_value=10**9):
    try:
        parsed = int(value)
        if parsed <= 0:
            return default
        return min(parsed, max_value)
    except (TypeError, ValueError):
        return default


def parse_chinese_number(raw):
    if not raw:
        return None
    if re.fullmatch(r'\d+', raw):
        return int(raw)
    total = 0
    current = 0
    for ch in raw:
        if ch in CHINESE_DIGIT_MAP:
            current = CHINESE_DIGIT_MAP[ch]
        elif ch == '十':
            total += (current or 1) * 10
            current = 0
        elif ch == '百':
            total += (current or 1) * 100
            current = 0
        elif ch == '千':
            total += (current or 1) * 1000
            current = 0
        else:
            return None
    return total + current


def extract_episode_no_by_text(raw_text):
    text = str(raw_text or '')
    patterns = [
        re.compile(r'第\s*([零〇一二两三四五六七八九十百千\d]+)\s*[集话話]', re.I),
        re.compile(r'(?:ep|episode|e)\s*[-_.]?[\s]*0*(\d{1,4})', re.I),
        re.compile(r'^(\d{1,4})(?:\D|$)'),
    ]
    for pattern in patterns:
        m = pattern.search(text)
        if m:
            value = parse_chinese_number(m.group(1))
            if isinstance(value, int) and value > 0:
                return value

    m = re.search(r'(\d{1,4})', text)
    if m:
        value = int(m.group(1))
        if value > 0:
            return value
    return None


def parse_directory_links(html, directory_url):
    href_matches = re.findall(r'href\s*=\s*(["\'])(.*?)\1', str(html or ''), re.I)
    files = []
    for _, raw_href in href_matches:
        raw_href = raw_href.strip()
        if not raw_href or raw_href.startswith('#') or raw_href.startswith('?'):
            continue
        if raw_href.lower().startswith(('mailto:', 'javascript:')):
            continue
        absolute = requests.compat.urljoin(directory_url, raw_href)
        pathname = unquote(urlparse(absolute).path)
        if pathname.endswith('/') or not VIDEO_EXTENSION_RE.search(pathname):
            continue
        filename = pathname.split('/')[-1] if pathname else ''
        episode_no = extract_episode_no_by_text(filename) or extract_episode_no_by_text(pathname)
        if not episode_no:
            continue
        files.append({'episodeNo': episode_no, 'videoUrl': absolute, 'filename': filename})

    files.sort(key=lambda x: (x['episodeNo'], x['videoUrl']))
    unique = {}
    for item in files:
        unique.setdefault(item['episodeNo'], item)
    return list(unique.values())


def resolve_sort(sort):
    sort_map = {
        'updated_desc': 't.updated_at DESC, t.name ASC',
        'updated_asc': 't.updated_at ASC, t.name ASC',
        'ingested_asc': 't.first_ingested_at ASC, t.name ASC',
        'ingested_desc': 't.first_ingested_at DESC, t.name ASC',
        'name_asc': 't.name ASC',
        'name_desc': 't.name DESC',
    }
    return sort_map.get(sort, sort_map['updated_desc'])


def query_series(params):
    tag = params.get('tag')
    name = params.get('name')
    search = params.get('search')
    sort = params.get('sort')
    page = parse_positive_int(params.get('page'), 1)
    page_size = parse_positive_int(params.get('pageSize'), 25, 1000)

    filters, values = [], []
    if tag:
        values.append(tag)
        filters.append(f"""EXISTS (
      SELECT 1 FROM title_tag tt
      JOIN tag g ON g.id = tt.tag_id
      WHERE tt.title_id = t.id AND g.tag_name = %s
    )""")
    if name:
        values.append(name)
        filters.append('t.name = %s')
    if search:
        values.append(f"%{search.strip().lower()}%")
        filters.append('LOWER(t.name) LIKE %s')

    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ''
    order_by_clause = resolve_sort(sort)
    order_by_selected_titles = order_by_clause.replace('t.', 'st.')

    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(f"SELECT COUNT(*)::int AS total FROM title t {where_clause}", values)
            total = cur.fetchone()['total']
            total_pages = max(1, (total + page_size - 1) // page_size)
            safe_page = min(page, total_pages)
            offset = (safe_page - 1) * page_size
            list_values = values + [page_size, offset]

            sql = f"""
              WITH selected_titles AS (
                SELECT t.id, t.name, t.cover_url, t.first_ingested_at, t.updated_at
                FROM title t
                {where_clause}
                ORDER BY {order_by_clause}
                LIMIT %s OFFSET %s
              )
              SELECT
                st.id,
                st.name,
                st.cover_url AS poster,
                st.first_ingested_at AS "firstIngestedAt",
                st.updated_at AS "updatedAt",
                COALESCE(MAX(e.first_ingested_at), st.first_ingested_at) AS "lastNewEpisodeAt",
                COALESCE(ARRAY_AGG(DISTINCT g.tag_name) FILTER (WHERE g.tag_name IS NOT NULL), ARRAY[]::text[]) AS tags,
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
              FROM selected_titles st
              LEFT JOIN episode e ON e.title_id = st.id
              LEFT JOIN title_tag tt ON tt.title_id = st.id
              LEFT JOIN tag g ON g.id = tt.tag_id
              GROUP BY st.id, st.name, st.cover_url, st.first_ingested_at, st.updated_at
              ORDER BY {order_by_selected_titles}
            """
            cur.execute(sql, list_values)
            rows = cur.fetchall()

    for row in rows:
        row['tags'] = row.get('tags') or []
        row['episodes'] = row.get('episodes') or []
    return {'data': rows, 'pagination': {'total': total, 'page': safe_page, 'pageSize': page_size, 'totalPages': total_pages}}


def assign_title_tags(cur, title_id, tags):
    cur.execute('DELETE FROM title_tag WHERE title_id = %s', (title_id,))
    if not tags:
        return
    cur.execute(
        """
        INSERT INTO title_tag(title_id, tag_id)
        SELECT %s, tag.id FROM tag WHERE tag.tag_name = ANY(%s)
        ON CONFLICT DO NOTHING
        """,
        (title_id, tags),
    )


app = Flask(__name__, static_folder='.', static_url_path='')


@app.get('/api/health')
def health():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT 1')
    return jsonify({'status': 'ok'})


@app.get('/api/ingest-records')
def ingest_records():
    sql = """
    SELECT t.name, e.episode_no AS episode, t.cover_url AS poster, e.episode_url AS "videoUrl",
      e.first_ingested_at AS "firstIngestedAt", e.updated_at AS "updatedAt",
      COALESCE(ARRAY_AGG(g.tag_name ORDER BY g.sort_no, g.tag_name) FILTER (WHERE g.tag_name IS NOT NULL), ARRAY[]::text[]) AS tags
    FROM title t
    JOIN episode e ON e.title_id = t.id
    LEFT JOIN title_tag tt ON tt.title_id = t.id
    LEFT JOIN tag g ON g.id = tt.tag_id
    GROUP BY t.id, e.id
    ORDER BY t.name, e.episode_no
    """
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql)
            rows = cur.fetchall()
    return jsonify({'data': rows})


@app.get('/api/series')
def series_get():
    return jsonify(query_series(request.args))


@app.get('/api/tags')
def tags_get():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT tag_name FROM tag ORDER BY sort_no ASC, tag_name ASC')
            data = [r[0] for r in cur.fetchall()]
    return jsonify({'data': data})


@app.post('/api/tags')
def tags_post():
    body = request.get_json(silent=True) or {}
    tag_name = str(body.get('tagName') or '').strip()
    if not tag_name:
        return jsonify({'message': 'tagName 不能为空'}), 400
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute('INSERT INTO tag(tag_name) VALUES (%s)', (tag_name,))
            conn.commit()
    except psycopg2.Error as e:
        if e.pgcode == '23505':
            return jsonify({'message': '标签已存在'}), 409
        raise
    return jsonify({'message': '标签已创建，请为剧集分配此标签', 'data': tag_name}), 201


@app.patch('/api/tags/<path:tag_name>')
def tags_patch(tag_name):
    body = request.get_json(silent=True) or {}
    new_tag_name = str(body.get('newTagName') or '').strip()
    if not new_tag_name:
        return jsonify({'message': 'newTagName 不能为空'}), 400
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute('UPDATE tag SET tag_name = %s WHERE tag_name = %s', (new_tag_name, tag_name))
            updated = cur.rowcount
        conn.commit()
    if not updated:
        return jsonify({'message': '标签不存在'}), 404
    return jsonify({'message': '标签改名成功'})


@app.delete('/api/tags/<path:tag_name>')
def tags_delete(tag_name):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute('DELETE FROM tag WHERE tag_name = %s', (tag_name,))
            deleted = cur.rowcount
        conn.commit()
    if not deleted:
        return jsonify({'message': '标签不存在'}), 404
    return jsonify({'message': '标签已删除'})


@app.post('/api/titles')
def titles_post():
    body = request.get_json(silent=True) or {}
    name = str(body.get('name') or '').strip()
    poster = str(body.get('poster') or '').strip()
    tags = [str(x).strip() for x in (body.get('tags') or []) if str(x).strip()]
    if not name or not poster:
        return jsonify({'message': 'name 和 poster 不能为空'}), 400

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute('INSERT INTO title(name, cover_url) VALUES (%s, %s) RETURNING id', (name, poster))
                title_id = cur.fetchone()[0]
                assign_title_tags(cur, title_id, tags)
            conn.commit()
    except psycopg2.Error as e:
        if e.pgcode == '23505':
            return jsonify({'message': '漫剧名称已存在'}), 409
        raise
    return jsonify({'message': '漫剧已创建'}), 201


@app.patch('/api/titles/<path:title_name>')
def titles_patch(title_name):
    body = request.get_json(silent=True) or {}
    new_name = str(body.get('newName') or '').strip()
    poster = str(body.get('poster') or '').strip()
    tags = [str(x).strip() for x in (body.get('tags') or []) if str(x).strip()]
    if not new_name or not poster or not isinstance(body.get('tags'), list):
        return jsonify({'message': 'newName、poster、tags 参数不完整'}), 400
    if not tags:
        return jsonify({'message': 'tags 至少需要一个标签'}), 400

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute('SELECT id FROM title WHERE name = %s', (title_name,))
                row = cur.fetchone()
                if not row:
                    return jsonify({'message': '漫剧不存在'}), 404
                title_id = row[0]
                cur.execute('UPDATE title SET name = %s, cover_url = %s WHERE id = %s', (new_name, poster, title_id))
                assign_title_tags(cur, title_id, tags)
            conn.commit()
    except psycopg2.Error as e:
        if e.pgcode == '23505':
            return jsonify({'message': '目标名称已存在'}), 409
        raise
    return jsonify({'message': '漫剧信息修改成功'})


@app.delete('/api/titles/<path:title_name>')
def titles_delete(title_name):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute('DELETE FROM title WHERE name = %s', (title_name,))
            deleted = cur.rowcount
        conn.commit()
    if not deleted:
        return jsonify({'message': '漫剧不存在'}), 404
    return jsonify({'message': '漫剧删除成功'})


@app.post('/api/episodes/batch-directory')
def episodes_batch_directory():
    body = request.get_json(silent=True) or {}
    name = str(body.get('name') or '').strip()
    poster = str(body.get('poster') or '').strip()
    directory_url = str(body.get('directoryUrl') or '').strip()
    tags = [str(x).strip() for x in (body.get('tags') or []) if str(x).strip()]
    if not name or not poster or not directory_url:
        return jsonify({'message': 'name、poster、directoryUrl 不能为空'}), 400
    if not tags:
        return jsonify({'message': 'tags 至少需要一个标签'}), 400
    parsed = urlparse(directory_url)
    if parsed.scheme not in ('http', 'https'):
        return jsonify({'message': 'directoryUrl 只支持 http/https'}), 400

    resp = requests.get(directory_url, timeout=10)
    if resp.status_code >= 400:
        return jsonify({'message': f'读取目录失败：HTTP {resp.status_code}'}), 400
    if 'html' not in (resp.headers.get('content-type') or '').lower():
        return jsonify({'message': '目录地址返回的不是 HTML 页面，无法解析视频列表'}), 400

    parsed_episodes = parse_directory_links(resp.text, directory_url)
    if not parsed_episodes:
        return jsonify({'message': '目录中未识别到可导入的视频文件。请确认链接可直接访问且文件名包含集号（如第1集/第一集/EP01）。'}), 400

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute('SELECT id FROM title WHERE name = %s', (name,))
                row = cur.fetchone()
                if row:
                    title_id = row[0]
                    cur.execute('UPDATE title SET cover_url = %s WHERE id = %s', (poster, title_id))
                else:
                    cur.execute('INSERT INTO title(name, cover_url) VALUES (%s, %s) RETURNING id', (name, poster))
                    title_id = cur.fetchone()[0]

                cur.execute('SELECT id FROM tag WHERE tag_name = ANY(%s)', (tags,))
                if cur.rowcount == 0:
                    return jsonify({'message': '所选标签不存在，请先创建标签'}), 400
                assign_title_tags(cur, title_id, tags)

                inserted = 0
                updated = 0
                for item in parsed_episodes:
                    cur.execute(
                        'INSERT INTO episode(title_id, episode_no, episode_url) VALUES (%s, %s, %s) ON CONFLICT (title_id, episode_no) DO NOTHING',
                        (title_id, item['episodeNo'], item['videoUrl']),
                    )
                    if cur.rowcount:
                        inserted += 1
                    else:
                        cur.execute('UPDATE episode SET episode_url = %s WHERE title_id = %s AND episode_no = %s', (item['videoUrl'], title_id, item['episodeNo']))
                        updated += cur.rowcount
            conn.commit()
    except psycopg2.Error as e:
        if e.pgcode == '23505':
            return jsonify({'message': '漫剧名称冲突，请更换名称'}), 409
        raise

    return jsonify({
        'message': f'批量导入完成，共识别 {len(parsed_episodes)} 集',
        'data': {
            'total': len(parsed_episodes),
            'inserted': inserted,
            'updated': updated,
            'episodes': [{'episodeNo': x['episodeNo'], 'videoUrl': x['videoUrl']} for x in parsed_episodes],
        },
    }), 201


@app.post('/api/episodes')
def episodes_post():
    body = request.get_json(silent=True) or {}
    title_name = str(body.get('titleName') or '').strip()
    episode_no = body.get('episodeNo')
    video_url = str(body.get('videoUrl') or '').strip()
    try:
        episode_no = int(episode_no)
    except (TypeError, ValueError):
        episode_no = None
    if not title_name or episode_no is None or not video_url:
        return jsonify({'message': '参数不完整'}), 400
    if episode_no <= 0:
        return jsonify({'message': '集号必须大于0'}), 400

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT id FROM title WHERE name = %s', (title_name,))
            row = cur.fetchone()
            if not row:
                return jsonify({'message': '漫剧不存在'}), 404
            try:
                cur.execute('INSERT INTO episode(title_id, episode_no, episode_url) VALUES (%s, %s, %s)', (row[0], episode_no, video_url))
                conn.commit()
            except psycopg2.Error as e:
                conn.rollback()
                if e.pgcode == '23505':
                    return jsonify({'message': '目标集号已存在'}), 409
                raise
    return jsonify({'message': '剧集新增成功'}), 201


@app.patch('/api/episodes')
def episodes_patch():
    body = request.get_json(silent=True) or {}
    title_name = str(body.get('titleName') or '').strip()
    video_url = str(body.get('videoUrl') or '').strip()
    try:
        source_no = int(body.get('episodeNo'))
        target_no = int(body.get('newEpisodeNo'))
    except (TypeError, ValueError):
        return jsonify({'message': '参数不完整'}), 400

    if not title_name or not video_url:
        return jsonify({'message': '参数不完整'}), 400
    if source_no <= 0 or target_no <= 0:
        return jsonify({'message': '集号必须大于0'}), 400

    sql = """
    UPDATE episode e SET episode_no = %s, episode_url = %s
    FROM title t
    WHERE e.title_id = t.id AND t.name = %s AND e.episode_no = %s
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(sql, (target_no, video_url, title_name, source_no))
                count = cur.rowcount
                conn.commit()
            except psycopg2.Error as e:
                conn.rollback()
                if e.pgcode == '23505':
                    return jsonify({'message': '目标集号已存在'}), 409
                raise
    if not count:
        return jsonify({'message': '剧集不存在'}), 404
    return jsonify({'message': '剧集信息修改成功'})


@app.delete('/api/episodes')
def episodes_delete():
    body = request.get_json(silent=True) or {}
    title_name = str(body.get('titleName') or '').strip()
    try:
        episode_no = int(body.get('episodeNo'))
    except (TypeError, ValueError):
        return jsonify({'message': '参数不完整'}), 400

    if not title_name:
        return jsonify({'message': '参数不完整'}), 400
    if episode_no <= 0:
        return jsonify({'message': '集号必须大于0'}), 400

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                'DELETE FROM episode e USING title t WHERE e.title_id = t.id AND t.name = %s AND e.episode_no = %s',
                (title_name, episode_no),
            )
            deleted = cur.rowcount
        conn.commit()
    if not deleted:
        return jsonify({'message': '剧集不存在'}), 404
    return jsonify({'message': '剧集删除成功'})


@app.get('/')
def index_page():
    return send_from_directory(ROOT_DIR, 'index.html')


@app.get('/<path:path_name>')
def static_files(path_name):
    target = os.path.join(ROOT_DIR, path_name)
    if os.path.isfile(target):
        return send_from_directory(ROOT_DIR, path_name)
    return send_from_directory(ROOT_DIR, 'index.html')


if __name__ == '__main__':
    port = int(optional_env('PORT') or '4173')
    app.run(host='0.0.0.0', port=port)
