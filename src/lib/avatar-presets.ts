/**
 * 8 preset avatars as inline SVG data URIs.
 * Geometric / abstract — matches the gold-on-dark theme.
 */
function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const PRESETS_SVG: { id: string; svg: string }[] = [
  {
    id: "aurora",
    svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#f5c66b'/><stop offset='1' stop-color='#b8731f'/></linearGradient></defs><rect width='128' height='128' fill='url(#g)'/><circle cx='40' cy='44' r='28' fill='#1a120b' opacity='.25'/><circle cx='86' cy='90' r='38' fill='#fff' opacity='.15'/></svg>`,
  },
  {
    id: "ember",
    svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><defs><linearGradient id='g' x1='0' y1='1' x2='1' y2='0'><stop offset='0' stop-color='#7a1d1d'/><stop offset='1' stop-color='#f59e0b'/></linearGradient></defs><rect width='128' height='128' fill='url(#g)'/><path d='M0 96 L64 60 L128 96 L128 128 L0 128 Z' fill='#0c0a07' opacity='.45'/></svg>`,
  },
  {
    id: "midnight",
    svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#0f172a'/><stop offset='1' stop-color='#334155'/></linearGradient></defs><rect width='128' height='128' fill='url(#g)'/><circle cx='90' cy='40' r='22' fill='#fde68a'/><circle cx='100' cy='38' r='18' fill='#0f172a'/></svg>`,
  },
  {
    id: "lagoon",
    svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#0e7490'/><stop offset='1' stop-color='#22d3ee'/></linearGradient></defs><rect width='128' height='128' fill='url(#g)'/><path d='M0 80 Q32 60 64 80 T128 80 V128 H0 Z' fill='#022c3a' opacity='.6'/></svg>`,
  },
  {
    id: "violet",
    svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#4c1d95'/><stop offset='1' stop-color='#ec4899'/></linearGradient></defs><rect width='128' height='128' fill='url(#g)'/><polygon points='64,16 112,96 16,96' fill='#fff' opacity='.15'/></svg>`,
  },
  {
    id: "forest",
    svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><defs><linearGradient id='g' x1='0' y1='1' x2='1' y2='0'><stop offset='0' stop-color='#064e3b'/><stop offset='1' stop-color='#84cc16'/></linearGradient></defs><rect width='128' height='128' fill='url(#g)'/><circle cx='64' cy='64' r='30' fill='#fff' opacity='.18'/><circle cx='64' cy='64' r='18' fill='#022c22' opacity='.5'/></svg>`,
  },
  {
    id: "rose",
    svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fb7185'/><stop offset='1' stop-color='#7c2d12'/></linearGradient></defs><rect width='128' height='128' fill='url(#g)'/><circle cx='64' cy='52' r='26' fill='#fff' opacity='.25'/><rect x='32' y='84' width='64' height='28' rx='14' fill='#1c0a06' opacity='.4'/></svg>`,
  },
  {
    id: "ink",
    svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><rect width='128' height='128' fill='#0a0a0a'/><circle cx='64' cy='64' r='40' fill='none' stroke='#f5c66b' stroke-width='3'/><circle cx='64' cy='64' r='22' fill='#f5c66b'/></svg>`,
  },
];

export const AVATAR_PRESETS: { id: string; url: string }[] = PRESETS_SVG.map((p) => ({
  id: p.id,
  url: svgDataUri(p.svg),
}));

export function isPresetAvatar(url: string | null | undefined): boolean {
  if (!url) return false;
  return AVATAR_PRESETS.some((p) => p.url === url);
}
