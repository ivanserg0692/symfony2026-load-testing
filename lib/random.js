import { fail } from 'k6';

export function randomItem(items, name) {
  if (!Array.isArray(items) || items.length === 0) {
    fail(`${name} is empty or invalid`);
  }

  return items[Math.floor(Math.random() * items.length)];
}

export function randomDifferentItem(items, currentId, name) {
  const candidates = Array.isArray(items)
    ? items.filter((item) => item && item.id !== currentId)
    : [];

  return randomItem(candidates.length > 0 ? candidates : items, name);
}
