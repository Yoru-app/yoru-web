// Свои уведомления по списку Shikimori: работают без права messages,
// которое Shikimori не выдаёт новым приложениям.
// Сравниваем вышедшие серии и статус тайтлов с прошлой проверкой.
import { store, state } from './core.js';
import { loadRates, rates, loggedIn } from './shiki.js';

const TRACKED = ['watching', 'rewatching', 'planned', 'on_hold'];
const KEY = 'feed';
const blank = (owner) => ({ owner, seen: {}, items: [], at: 0 });

function load(owner) {
  const f = store.get(KEY, null);
  return f && f.owner === owner ? f : blank(owner);
}

export async function syncFeed(force = false) {
  const owner = loggedIn() ? 'u' + state.auth.user.id : (store.get('shikiNick', '') ? 'n' + store.get('shikiNick', '') : null);
  if (!owner) return { items: [], unread: 0 };
  const feed = load(owner);
  if (!force && Date.now() - feed.at < 10 * 60e3) return summary(feed);
  await loadRates(force);
  const first = !Object.keys(feed.seen).length;
  const now = new Date().toISOString();
  for (const r of rates.list || []) {
    if (!TRACKED.includes(r.status)) continue;
    const a = r.anime, prev = feed.seen[a.id];
    const push = (kind, text, ep = 0) => {
      if (feed.items.some((x) => x.aid === a.id && x.kind === kind && x.ep === ep)) return;
      feed.items.unshift({ id: `${a.id}-${kind}-${ep}`, aid: a.id, kind, ep, text, at: now, read: false, title: a.title, poster: a.poster });
    };
    if (!prev) {
      // первая проверка: показываем только то, что уже ждёт вас в «Смотрю»
      if (first && a.status === 'ongoing' && a.aired > r.episodes && r.status !== 'planned') push('episode', `Вышла ${a.aired}-я серия`, a.aired);
    } else {
      if (a.aired > prev.aired) push('episode', a.aired - prev.aired > 1 ? `Вышли серии ${prev.aired + 1}–${a.aired}` : `Вышла ${a.aired}-я серия`, a.aired);
      if (prev.status === 'anons' && a.status === 'ongoing') push('ongoing', 'Начался показ');
      if (prev.status !== 'released' && a.status === 'released') push('released', 'Вышли все серии');
    }
    feed.seen[a.id] = { aired: a.aired, status: a.status };
  }
  feed.items = feed.items.slice(0, 120);
  feed.at = Date.now();
  store.set(KEY, feed);
  return summary(feed);
}
const summary = (feed) => ({ items: feed.items, unread: feed.items.filter((x) => !x.read).length });

export function readAllFeed() {
  const f = store.get(KEY, null);
  if (!f) return;
  f.items.forEach((x) => { x.read = true; });
  store.set(KEY, f);
}
export function markFeedRead(id) {
  const f = store.get(KEY, null);
  if (!f) return;
  const it = f.items.find((x) => x.id === id);
  if (it) { it.read = true; store.set(KEY, f); }
}
