import { esc, untilText } from './core.js';
import { KIND, STATUS, seasonLabel } from './shiki.js';

const kindIcons = new Map([
  ['tv', 'tv'], ['movie', 'movie'], ['ona', 'ona'], ['ova', 'ova'], ['special', 'special'], ['tv_special', 'special'],
]);
const statusTones = new Map([['ongoing', 'airing-ongoing'], ['released', 'airing-released']]);
const ratings = { g: 'G', pg: 'PG', pg_13: 'PG-13', r: 'R-17', r_plus: 'R+', rx: 'Rx' };

export function scoreClass(value) {
  if (value >= 8) return 'score-high';
  if (value >= 6) return 'score-mid';
  if (value >= 4) return 'score-fair';
  return value > 0 ? 'score-low' : '';
}

export function nextEpisodeFact(a) {
  if (!a || a.status !== 'ongoing' || !a.next) return null;
  const schedule = untilText(a.next);
  if (!schedule) return null;
  return {
    episode: (Number(a.aired) || 0) + 1,
    schedule,
  };
}

export function animeFacts(a, { yearOnly = false } = {}) {
  if (!a) return [];
  const airing = a.status === 'ongoing';
  const aired = Number(a.aired) || 0;
  const episodes = airing ? `${aired} / ${a.episodes || '?'}` : a.episodes || aired;
  const next = nextEpisodeFact(a);
  return [
    ['score', 'Оценка', a.score > 0 ? a.score.toFixed(2) : '', scoreClass(a.score)],
    ['kind', 'Тип', KIND[a.kind] || a.kind],
    ['episodes', 'Эпизоды', episodes],
    ['status', 'Статус', STATUS[a.status] || a.status],
    yearOnly ? ['year', 'Год', a.year] : ['season', 'Сезон', seasonLabel(a)],
    ['studio', 'Студия', a.studios?.join(', ')],
    ['duration', 'Длительность серии', a.duration ? `${a.duration} мин` : ''],
    ['rating', 'Возрастной рейтинг', ratings[a.rating]],
    ['next', 'Следующая серия', next ? `${next.episode}-я ${next.schedule}` : ''],
  ].filter(([, , value]) => value).map(([key, label, value, tone]) => {
    const iconId = key === 'kind' ? kindIcons.get(a.kind) || 'tv' : key === 'year' ? 'season' : key;
    let iconTone = '';
    if (key === 'kind' && Object.hasOwn(KIND, a.kind)) iconTone = `kind-${a.kind}`;
    if (key === 'status') iconTone = statusTones.get(a.status) || '';
    return { key, label, value, tone, iconTone, icon: `/title-info-icons.svg#${iconId}` };
  });
}

export function factsHTML(a, { includeNext = true, keys = null, yearOnly = false } = {}) {
  let facts = animeFacts(a, { yearOnly }).filter(({ key }) => includeNext || key !== 'next');
  if (keys) facts = keys.map((key) => facts.find((fact) => fact.key === key)).filter(Boolean);
  if (!facts.length) return '';
  return `<ul class="anime-facts" aria-label="Информация о тайтле">${facts.map(({ key, label, value, tone, iconTone, icon }) =>
    `<li${key === 'next' ? ' class="fact-next-row"' : ''}>
      <span class="anime-fact fact-${key} ${iconTone}" title="${label}">
        <svg class="anime-fact-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="${icon}"/></svg>
        <span class="sr">${label}: </span><span class="${tone || ''}">${esc(value)}</span>
      </span>
    </li>`).join('')}</ul>`;
}
