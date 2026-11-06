// Технические версии остаются различимыми и в списках, и в предпочтениях.
const releaseTag = /\b(?:bd(?:[ ._-]?(?:rip|remux))?|blu[ ._-]?ray|web[ ._-]?(?:dl|rip)|dvd(?:[ ._-]?(?:rip|remux))?|hd(?:tv|rip)|tv[ ._-]?rip|remaster(?:ed)?|uncensored|[248]k|(?:480|576|720|1080|1440|2160)[pi]|(?:x|h)[ ._-]?26[45]|hevc)\b/i;

export function authorGroup(value) {
  const full = String(value || '').trim();
  if (!full || /^(?:без[\s_-]*названия|unnamed|no[\s_-]*name)$/i.test(full)) return '';

  let name = full;
  // Учитываем вложенные скобки и состав в конце либо в середине названия.
  while (/[（(][^()（）]*[)）]/.test(name)) {
    name = name.replace(/[（(][^()（）]*[)）]/g, ' ');
  }
  name = name.replace(/\s+/g, ' ').trim();
  if (!name || /^(?:без[\s_-]*названия|unnamed|no[\s_-]*name)$/i.test(name)) return '';
  return releaseTag.test(full) ? full : name;
}

export const normAuthor = (value) => authorGroup(value).toLowerCase()
  .replace(/\.(tv|ru|com|org|club|online)\b/g, '')
  .replace(/[^a-zа-яё0-9]+/gi, '');

export const translationLabel = (value) => authorGroup(value) || 'Без названия';
