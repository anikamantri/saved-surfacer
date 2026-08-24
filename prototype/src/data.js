// The pipeline's output, loaded once. Everything on screen traces back to this file.
import bundle from '../public/data/entities.json';

export const DATA = bundle;
export const POSTS = bundle.posts;
export const ENTITIES = bundle.posts.flatMap((p) =>
  p.entities.map((e) => ({ ...e, post: p })));

export const TYPE_COLOR = {
  place: '#ff8a3d', workout: '#4ade80', product: '#60a5fa', recipe: '#f472b6', other: '#a78bfa',
};

export const thumb = (p) => (p.source.thumbnail ? `./${p.source.thumbnail}` : null);

export const fmtDate = (iso) => {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const ago = (iso, from = new Date('2026-08-24T12:00:00')) => {
  if (!iso) return '';
  const days = Math.round((from - new Date(iso)) / 86400000);
  if (days < 1) return 'today';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
};
