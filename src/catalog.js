import { reactive } from 'vue';

export const animeFilterDefaults = () => ({ genres: [], kind: [], status: [], season: [] });
export const animeFilterParams = (filters) => ({
  genre: filters.genres.join(','),
  kind: filters.kind.join(','),
  status: filters.status.join(','),
  season: filters.season.join(','),
});
export const hasAnimeFilters = (filters) => Object.values(animeFilterParams(filters)).some(Boolean);
const defaults = () => ({ ...animeFilterDefaults(), search: '', order: 'popularity' });
export const catalog = reactive({ ...defaults(), showAll: false });
export function resetCatalog() { Object.assign(catalog, defaults()); }
