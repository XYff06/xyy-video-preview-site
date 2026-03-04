const VIDEO_PREFIX = "https://cdn.example.com/videos";

const ingestRecords = [
  { name: "纯真年代的爱情", episode: 1, tags: ["国产剧", "爱情"], firstIngestedAt: "2026-02-01T10:00:00Z", updatedAt: "2026-02-05T10:00:00Z", poster: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=600&q=80" },
  { name: "纯真年代的爱情", episode: 2, tags: ["国产剧", "爱情"], firstIngestedAt: "2026-02-06T09:00:00Z", updatedAt: "2026-02-06T09:00:00Z", poster: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=600&q=80" },
  { name: "纯真年代的爱情", episode: 3, tags: ["国产剧", "爱情"], firstIngestedAt: "2026-02-08T09:00:00Z", updatedAt: "2026-02-11T09:00:00Z", poster: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=600&q=80" },
  { name: "除恶", episode: 1, tags: ["纪录片", "国产剧"], firstIngestedAt: "2026-02-07T08:00:00Z", updatedAt: "2026-02-07T08:00:00Z", poster: "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=600&q=80" },
  { name: "除恶", episode: 2, tags: ["纪录片", "国产剧"], firstIngestedAt: "2026-02-08T08:00:00Z", updatedAt: "2026-02-10T08:00:00Z", poster: "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=600&q=80" },
  { name: "除恶", episode: 3, tags: ["纪录片", "国产剧"], firstIngestedAt: "2026-02-12T08:00:00Z", updatedAt: "2026-02-12T08:00:00Z", poster: "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=600&q=80" },
  { name: "深海回响", episode: 1, tags: ["纪录片", "自然"], firstIngestedAt: "2026-02-10T07:00:00Z", updatedAt: "2026-02-10T07:00:00Z", poster: "https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=600&q=80" },
  { name: "深海回响", episode: 2, tags: ["纪录片", "自然"], firstIngestedAt: "2026-02-13T07:00:00Z", updatedAt: "2026-02-13T07:00:00Z", poster: "https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=600&q=80" },
  { name: "风起长街", episode: 1, tags: ["国产剧", "悬疑"], firstIngestedAt: "2026-02-09T12:00:00Z", updatedAt: "2026-02-09T12:00:00Z", poster: "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=600&q=80" },
  { name: "风起长街", episode: 2, tags: ["国产剧", "悬疑"], firstIngestedAt: "2026-02-14T12:00:00Z", updatedAt: "2026-02-16T12:00:00Z", poster: "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=600&q=80" },
  { name: "白塔回声", episode: 1, tags: ["国产剧", "都市"], firstIngestedAt: "2026-02-11T06:00:00Z", updatedAt: "2026-02-11T06:00:00Z", poster: "https://images.unsplash.com/photo-1460881680858-30d872d5b530?auto=format&fit=crop&w=600&q=80" },
  { name: "白塔回声", episode: 2, tags: ["国产剧", "都市"], firstIngestedAt: "2026-02-15T06:00:00Z", updatedAt: "2026-02-15T06:00:00Z", poster: "https://images.unsplash.com/photo-1460881680858-30d872d5b530?auto=format&fit=crop&w=600&q=80" },
  { name: "山海之间", episode: 1, tags: ["纪录片", "旅行"], firstIngestedAt: "2026-02-12T15:00:00Z", updatedAt: "2026-02-12T15:00:00Z", poster: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=600&q=80" },
  { name: "山海之间", episode: 2, tags: ["纪录片", "旅行"], firstIngestedAt: "2026-02-17T15:00:00Z", updatedAt: "2026-02-17T15:00:00Z", poster: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=600&q=80" },
  { name: "城市星光", episode: 1, tags: ["综艺", "都市"], firstIngestedAt: "2026-02-18T08:30:00Z", updatedAt: "2026-02-18T08:30:00Z", poster: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=600&q=80" },
  { name: "城市星光", episode: 2, tags: ["综艺", "都市"], firstIngestedAt: "2026-02-20T08:30:00Z", updatedAt: "2026-02-20T08:30:00Z", poster: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=600&q=80" }
];

const fmt = (iso) => new Date(iso).toLocaleString("zh-CN", { hour12: false });

function toVideoUrl(name, episode) {
  return `${VIDEO_PREFIX}/${encodeURIComponent(name)}/${episode}.mp4`;
}

function buildSeries(records) {
  const map = new Map();
  records.forEach((rec) => {
    if (!map.has(rec.name)) map.set(rec.name, { name: rec.name, tags: new Set(), episodes: [], poster: rec.poster });
    const s = map.get(rec.name);
    rec.tags.forEach((t) => s.tags.add(t));
    s.episodes.push({ episode: rec.episode, firstIngestedAt: rec.firstIngestedAt, updatedAt: rec.updatedAt, videoUrl: toVideoUrl(rec.name, rec.episode) });
  });

  for (const s of map.values()) {
    s.episodes.sort((a, b) => a.episode - b.episode);
    const maxEpisode = s.episodes[s.episodes.length - 1];
    s.lastNewEpisodeAt = maxEpisode.firstIngestedAt;
    s.firstIngestedAt = s.episodes.map((e) => e.firstIngestedAt).sort()[0];
    s.updatedAt = s.episodes.map((e) => e.updatedAt).sort().at(-1);
  }

  return [...map.values()].sort((a, b) => new Date(b.lastNewEpisodeAt) - new Date(a.lastNewEpisodeAt));
}

const state = {
  allSeries: buildSeries(ingestRecords),
  selectedTag: null,
  selectedEpisode: 1,
  tagExpanded: false
};

function currentPathName() {
  return decodeURIComponent(location.pathname.slice(1));
}

function render() {
  const app = document.getElementById("app");
  const activeName = currentPathName();
  if (activeName) {
    const series = state.allSeries.find((s) => s.name === activeName);
    if (series) return renderDetail(app, series);
  }
  renderHome(app);
}

function renderHome(app) {
  app.innerHTML = document.getElementById("home-template").innerHTML;
  const categoryList = document.getElementById("category-list");
  const grid = document.getElementById("series-grid");

  const allTags = [...new Set(state.allSeries.flatMap((item) => [...item.tags]))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const visibleTags = state.tagExpanded ? allTags : allTags.slice(0, 5);

  const navItems = [
    { type: "all", label: "全部" },
    ...visibleTags.map((tag) => ({ type: "tag", label: tag })),
    { type: "more", label: state.tagExpanded ? "收起" : "更多" }
  ];

  navItems.forEach((item) => {
    const btn = document.createElement("button");
    const isActive = item.type === "all"
      ? state.selectedTag === null
      : item.type === "tag"
      ? state.selectedTag === item.label
      : state.tagExpanded;

    btn.className = `category-pill ${isActive ? "active" : ""}`;
    btn.textContent = item.label;

    btn.onclick = () => {
      if (item.type === "all") {
        state.selectedTag = null;
      } else if (item.type === "tag") {
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
      const card = document.createElement("article");
      card.className = "poster-card";
      card.innerHTML = `
        <div class="poster" style="background-image:url('${series.poster}')"></div>
        <p class="poster-title">${series.name}</p>
      `;
      card.onclick = () => {
        history.pushState({}, "", `/${encodeURIComponent(series.name)}`);
        state.selectedEpisode = 1;
        render();
      };
      grid.appendChild(card);
    });
}

function renderDetail(app, series) {
  app.innerHTML = document.getElementById("detail-template").innerHTML;

  document.getElementById("back-home").onclick = () => {
    history.pushState({}, "", "/");
    render();
  };

  const episodeRow = document.getElementById("episode-row");
  series.episodes.forEach((ep) => {
    const tab = document.createElement("button");
    tab.className = `episode-tab ${state.selectedEpisode === ep.episode ? "active" : ""}`;
    tab.textContent = `第 ${ep.episode} 集`;
    tab.onclick = () => {
      state.selectedEpisode = ep.episode;
      render();
    };
    episodeRow.appendChild(tab);

  });

  const selected = series.episodes.find((e) => e.episode === state.selectedEpisode) || series.episodes[0];
  const player = document.getElementById("player");
  player.src = selected.videoUrl;
  document.getElementById("player-meta").textContent = `${series.name} / 第 ${selected.episode} 集 / ${selected.videoUrl}`;
}

window.addEventListener("popstate", render);
render();