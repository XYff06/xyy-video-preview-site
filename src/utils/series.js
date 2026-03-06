export function normalizeEpisodes(episodes) {
  const normalizedEpisodes = new Map();

  episodes.forEach((episodeItem) => {
    const episodeNumber = Number(episodeItem.episode);
    if (!Number.isFinite(episodeNumber)) return;

    const existingEpisode = normalizedEpisodes.get(episodeNumber);
    if (!existingEpisode) {
      normalizedEpisodes.set(episodeNumber, { ...episodeItem, episode: episodeNumber });
      return;
    }

    const existingUpdatedAt = new Date(existingEpisode.updatedAt || 0).getTime();
    const nextUpdatedAt = new Date(episodeItem.updatedAt || 0).getTime();

    if (nextUpdatedAt >= existingUpdatedAt) {
      normalizedEpisodes.set(episodeNumber, { ...episodeItem, episode: episodeNumber });
    }
  });

  return [...normalizedEpisodes.values()].sort((leftEpisode, rightEpisode) => leftEpisode.episode - rightEpisode.episode);
}

export function getAllTags(seriesList, explicitTags = []) {
  if (explicitTags.length) return [...explicitTags];
  return [...new Set(seriesList.flatMap((seriesItem) => [...seriesItem.tags]))]
    .sort((leftTag, rightTag) => leftTag.localeCompare(rightTag, 'zh-CN'));
}

export function getEpisodeOptionsByTitle(seriesList, titleName) {
  const targetSeries = seriesList.find((seriesItem) => seriesItem.name === titleName);
  if (!targetSeries) return [];
  return normalizeEpisodes(targetSeries.episodes);
}

export function fillEpisodeSelectByTitle(seriesList, titleSelectNode, episodeSelectNode, placeholderText) {
  const episodes = getEpisodeOptionsByTitle(seriesList, titleSelectNode.value);
  episodeSelectNode.innerHTML = `<option value="">${placeholderText}</option>${episodes
    .map((episodeItem) => `<option value="${episodeItem.episode}">第${episodeItem.episode}集</option>`)
    .join('')}`;
}
