const fmt = (iso) => new Date(iso).toLocaleString('zh-CN', { hour12: false });

const state = {
  allSeries: [],
  selectedTag: null,
  selectedEpisode: 1,
  tagExpanded: false,
  loading: true,
  error: null
};

function currentPathName() {
  return decodeURIComponent(location.pathname.slice(1));
}

async function loadSeries() {
  try {
    const response = await fetch('/api/series');
    if (!response.ok) {
      throw new Error(`服务异常：${response.status}`);
    }

    const payload = await response.json();
    state.allSeries = payload.data.map((item) => ({ ...item, tags: new Set(item.tags) }));
    state.loading = false;
    state.error = null;
  } catch (error) {
    state.loading = false;
    state.error = error.message;
  }

  render();
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

  const activeName = currentPathName();
  if (activeName) {
    const series = state.allSeries.find((s) => s.name === activeName);
    if (series) return renderDetail(app, series);
  }
  renderHome(app);
}

function renderHome(app) {
  app.innerHTML = document.getElementById('home-template').innerHTML;
  const categoryList = document.getElementById('category-list');
  const grid = document.getElementById('series-grid');

  const allTags = [...new Set(state.allSeries.flatMap((item) => [...item.tags]))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
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

function renderDetail(app, series) {
  app.innerHTML = document.getElementById('detail-template').innerHTML;

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
  document.getElementById('player-meta').textContent = `${series.name}
第${selected.episode}集
首次入库：${fmt(selected.firstIngestedAt)}
最近更新：${fmt(selected.updatedAt)}
${selected.videoUrl}`;
}

window.addEventListener('popstate', render);
render();
loadSeries();
