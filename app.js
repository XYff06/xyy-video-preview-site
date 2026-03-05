const fmt = (iso) => new Date(iso).toLocaleString('zh-CN', { hour12: false });

const state = {
  allSeries: [],
  selectedTag: null,
  selectedEpisode: 1,
  tagExpanded: false,
  loading: true,
  error: null,
  activeAdminTab: 'tag',
  flashMessage: ''
};

function currentPathName() {
  return decodeURIComponent(location.pathname.slice(1));
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || '请求失败');
  }
  return payload;
}

async function loadSeries() {
  try {
    const payload = await apiFetch('/api/series');
    state.allSeries = payload.data.map((item) => ({ ...item, tags: new Set(item.tags) }));
    state.loading = false;
    state.error = null;
  } catch (error) {
    state.loading = false;
    state.error = error.message;
  }

  render();
}

function getAllTags() {
  return [...new Set(state.allSeries.flatMap((item) => [...item.tags]))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function getFlashHtml() {
  if (!state.flashMessage) return '';
  return `<div class="flash-msg">${state.flashMessage}</div>`;
}

function render() {
  const app = document.getElementById('app');

  if (state.loading) {
    app.innerHTML = '<p>正在加载剧集数据...</p>';
    return;
  }

  if (state.error) {
    app.innerHTML = `<p>加载失败：${state.error}</p>`;
    return;
  }

  app.innerHTML = `
    <section class="layout-shell">
      <aside class="admin-sidebar">
        <button class="admin-nav-btn ${state.activeAdminTab === 'tag' ? 'active' : ''}" data-admin-tab="tag">标签管理</button>
        <button class="admin-nav-btn ${state.activeAdminTab === 'title' ? 'active' : ''}" data-admin-tab="title">漫剧管理</button>
        <button class="admin-nav-btn ${state.activeAdminTab === 'episode' ? 'active' : ''}" data-admin-tab="episode">内容管理</button>
      </aside>
      <section class="content-shell">
        ${getFlashHtml()}
        <section id="page-content"></section>
        <section id="admin-content"></section>
      </section>
    </section>
  `;

  document.querySelectorAll('[data-admin-tab]').forEach((btn) => {
    btn.onclick = () => {
      state.activeAdminTab = btn.dataset.adminTab;
      render();
    };
  });

  const pageContent = document.getElementById('page-content');
  const activeName = currentPathName();
  if (activeName) {
    const series = state.allSeries.find((s) => s.name === activeName);
    if (series) {
      renderDetail(pageContent, series);
    } else {
      history.replaceState({}, '', '/');
      renderHome(pageContent);
    }
  } else {
    renderHome(pageContent);
  }

  renderAdminPanel(document.getElementById('admin-content'));
}

function renderHome(container) {
  container.innerHTML = document.getElementById('home-template').innerHTML;
  const categoryList = document.getElementById('category-list');
  const grid = document.getElementById('series-grid');

  const allTags = getAllTags();
  const visibleTags = state.tagExpanded ? allTags : allTags.slice(0, 5);

  const navItems = [
    { type: 'all', label: '全部' },
    ...visibleTags.map((tag) => ({ type: 'tag', label: tag })),
    { type: 'more', label: state.tagExpanded ? '收起' : '更多' }
  ];

  navItems.forEach((item) => {
    const btn = document.createElement('button');
    const isActive = item.type === 'all' ? state.selectedTag === null : item.type === 'tag' ? state.selectedTag === item.label : state.tagExpanded;

    btn.className = `category-pill ${isActive ? 'active' : ''}`;
    btn.textContent = item.label;

    btn.onclick = () => {
      if (item.type === 'all') {
        state.selectedTag = null;
      } else if (item.type === 'tag') {
        state.selectedTag = item.label;
      } else {
        state.tagExpanded = !state.tagExpanded;
      }
      render();
    };
    categoryList.appendChild(btn);
  });

  state.allSeries
    .filter((s) => !state.selectedTag || s.tags.has(state.selectedTag))
    .forEach((series) => {
      const card = document.createElement('article');
      card.className = 'poster-card';
      card.innerHTML = `
        <div class="poster" style="background-image:url('${series.poster}')"></div>
        <p class="poster-title">${series.name}</p>
      `;
      card.onclick = () => {
        history.pushState({}, '', `/${encodeURIComponent(series.name)}`);
        state.selectedEpisode = 1;
        render();
      };
      grid.appendChild(card);
    });
}

function renderDetail(container, series) {
  container.innerHTML = document.getElementById('detail-template').innerHTML;

  document.getElementById('back-home').onclick = () => {
    history.pushState({}, '', '/');
    render();
  };

  const episodeRow = document.getElementById('episode-row');
  series.episodes.forEach((ep) => {
    const tab = document.createElement('button');
    tab.className = `episode-tab ${state.selectedEpisode === ep.episode ? 'active' : ''}`;
    tab.textContent = `第${ep.episode}集`;
    tab.onclick = () => {
      state.selectedEpisode = ep.episode;
      render();
    };
    episodeRow.appendChild(tab);
  });

  const selected = series.episodes.find((e) => e.episode === state.selectedEpisode) || series.episodes[0];
  const player = document.getElementById('player');
  player.src = selected.videoUrl;
  document.getElementById('player-meta').textContent = `${series.name}\n第${selected.episode}集\n首次入库：${fmt(selected.firstIngestedAt)}\n最近更新：${fmt(selected.updatedAt)}\n${selected.videoUrl}`;
}

function renderAdminPanel(container) {
  if (state.activeAdminTab === 'tag') {
    const tags = getAllTags();
    container.innerHTML = `
      <section class="admin-panel">
        <h3>标签管理</h3>
        <form id="tag-create-form" class="inline-form">
          <input name="tagName" required placeholder="新标签名" />
          <button type="submit">新建标签</button>
        </form>
        <div class="admin-list">${tags
          .map(
            (tag) => `
              <div class="admin-item">
                <span>${tag}</span>
                <button data-tag-rename="${tag}">改名</button>
                <button data-tag-delete="${tag}" class="danger">删除</button>
              </div>`
          )
          .join('')}</div>
      </section>
    `;

    document.getElementById('tag-create-form').onsubmit = async (event) => {
      event.preventDefault();
      const formData = new FormData(event.target);
      const tagName = String(formData.get('tagName') || '').trim();
      if (!tagName) return;
      try {
        await apiFetch('/api/tags', { method: 'POST', body: JSON.stringify({ tagName }) });
        state.flashMessage = `标签「${tagName}」已创建，请到漫剧管理里关联使用。`;
      } catch (error) {
        state.flashMessage = error.message;
      }
      render();
    };

    container.querySelectorAll('[data-tag-rename]').forEach((btn) => {
      btn.onclick = async () => {
        const oldName = btn.dataset.tagRename;
        const newTagName = prompt(`将标签“${oldName}”改名为：`, oldName);
        if (!newTagName || newTagName.trim() === oldName) return;
        try {
          await apiFetch(`/api/tags/${encodeURIComponent(oldName)}`, { method: 'PATCH', body: JSON.stringify({ newTagName }) });
          state.flashMessage = '标签改名成功';
        } catch (error) {
          state.flashMessage = error.message;
        }
        render();
      };
    });

    container.querySelectorAll('[data-tag-delete]').forEach((btn) => {
      btn.onclick = async () => {
        const tag = btn.dataset.tagDelete;
        if (!confirm(`确认删除标签“${tag}”？会从所有漫剧里移除该标签。`)) return;
        try {
          await apiFetch(`/api/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
          state.flashMessage = '标签删除成功';
          if (state.selectedTag === tag) state.selectedTag = null;
        } catch (error) {
          state.flashMessage = error.message;
        }
        render();
      };
    });
    return;
  }

  if (state.activeAdminTab === 'title') {
    const tags = getAllTags();
    container.innerHTML = `
      <section class="admin-panel">
        <h3>漫剧管理</h3>
        <form id="title-create-form" class="stack-form">
          <input name="name" required placeholder="新漫剧名称" />
          <input name="poster" required placeholder="海报 URL" />
          <input name="tags" placeholder="标签（逗号分隔，如：国产剧,悬疑）" />
          <button type="submit">新增漫剧</button>
        </form>
        <p class="hint">可用标签：${tags.join('、') || '暂无'}</p>
        <div class="admin-list">${state.allSeries
          .map(
            (series) => `
              <div class="admin-item">
                <span>${series.name}</span>
                <button data-title-rename="${series.name}">改名</button>
                <button data-title-delete="${series.name}" class="danger">删除</button>
              </div>`
          )
          .join('')}</div>
      </section>
    `;

    document.getElementById('title-create-form').onsubmit = async (event) => {
      event.preventDefault();
      const formData = new FormData(event.target);
      const name = String(formData.get('name') || '').trim();
      const poster = String(formData.get('poster') || '').trim();
      const tagsInput = String(formData.get('tags') || '');
      const titleTags = tagsInput
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      try {
        await apiFetch('/api/titles', { method: 'POST', body: JSON.stringify({ name, poster, tags: titleTags }) });
        state.flashMessage = `漫剧「${name}」已创建`;
        await loadSeries();
      } catch (error) {
        state.flashMessage = error.message;
        render();
      }
    };

    container.querySelectorAll('[data-title-rename]').forEach((btn) => {
      btn.onclick = async () => {
        const oldName = btn.dataset.titleRename;
        const newName = prompt(`将漫剧“${oldName}”改名为：`, oldName);
        if (!newName || newName.trim() === oldName) return;
        try {
          await apiFetch(`/api/titles/${encodeURIComponent(oldName)}`, { method: 'PATCH', body: JSON.stringify({ newName }) });
          state.flashMessage = '漫剧改名成功';
          if (currentPathName() === oldName) history.replaceState({}, '', `/${encodeURIComponent(newName.trim())}`);
          await loadSeries();
        } catch (error) {
          state.flashMessage = error.message;
          render();
        }
      };
    });

    container.querySelectorAll('[data-title-delete]').forEach((btn) => {
      btn.onclick = async () => {
        const name = btn.dataset.titleDelete;
        if (!confirm(`确认删除漫剧“${name}”？该漫剧下全部剧集会删除。`)) return;
        try {
          await apiFetch(`/api/titles/${encodeURIComponent(name)}`, { method: 'DELETE' });
          state.flashMessage = '漫剧删除成功';
          if (currentPathName() === name) history.replaceState({}, '', '/');
          await loadSeries();
        } catch (error) {
          state.flashMessage = error.message;
          render();
        }
      };
    });
    return;
  }

  container.innerHTML = `
    <section class="admin-panel">
      <h3>内容管理</h3>
      <form id="episode-update-form" class="stack-form">
        <select name="titleName" required>
          <option value="">选择漫剧</option>
          ${state.allSeries.map((series) => `<option value="${series.name}">${series.name}</option>`).join('')}
        </select>
        <input type="number" min="1" name="episodeNo" required placeholder="当前集号" />
        <input type="number" min="1" name="newEpisodeNo" required placeholder="新集号" />
        <input name="videoUrl" required placeholder="新播放 URL" />
        <button type="submit">保存剧集信息</button>
      </form>
      <p class="hint">可修改集号和播放地址，适合修复错链或重排集数。</p>
    </section>
  `;

  document.getElementById('episode-update-form').onsubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const payload = {
      titleName: String(formData.get('titleName') || '').trim(),
      episodeNo: Number(formData.get('episodeNo')),
      newEpisodeNo: Number(formData.get('newEpisodeNo')),
      videoUrl: String(formData.get('videoUrl') || '').trim()
    };

    try {
      await apiFetch('/api/episodes', { method: 'PATCH', body: JSON.stringify(payload) });
      state.flashMessage = '剧集信息更新成功';
      await loadSeries();
    } catch (error) {
      state.flashMessage = error.message;
      render();
    }
  };
}

window.addEventListener('popstate', render);
render();
loadSeries();
