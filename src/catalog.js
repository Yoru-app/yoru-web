import { reactive } from 'vue';

const defaults = () => ({ search: '', genres: [], kind: '', status: '', season: '', order: 'popularity' });
export const catalog = reactive({ ...defaults(), showAll: false });
export function resetCatalog() { Object.assign(catalog, defaults()); }
