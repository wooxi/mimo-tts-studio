/**
 * Icon set — hand-drawn linear SVG, 24×24 grid, stroke on currentColor.
 * Kept in one place so the whole UI stays visually consistent and there is
 * never an icon font or sprite request.
 */

const S = (body, { fill = false, w = 1.7 } = {}) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" ${
    fill
      ? `fill="currentColor"`
      : `fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`
  }>${body}</svg>`;

export const icons = {
  /* transport */
  play: S(
    '<path d="M8.6 5.6v12.8c0 .83.92 1.33 1.62.88l9.9-6.4a1.05 1.05 0 0 0 0-1.76l-9.9-6.4c-.7-.45-1.62.05-1.62.88z"/>',
    { fill: true },
  ),
  pause: S(
    '<rect x="6.7" y="5.2" width="3.4" height="13.6" rx="1.2"/><rect x="13.9" y="5.2" width="3.4" height="13.6" rx="1.2"/>',
    { fill: true },
  ),
  stop: S('<rect x="6.5" y="6.5" width="11" height="11" rx="2.4"/>', { fill: true }),
  download: S(
    '<path d="M12 4v10.4"/><path d="M7.6 10.2 12 14.6l4.4-4.4"/><path d="M4.8 19.4h14.4"/>',
  ),
  upload: S(
    '<path d="M12 15.4V5"/><path d="M7.6 9.4 12 5l4.4 4.4"/><path d="M4.8 19.4h14.4"/>',
  ),

  /* actions */
  plus: S('<path d="M12 5.4v13.2M5.4 12h13.2"/>', { w: 2 }),
  close: S('<path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8"/>', { w: 1.9 }),
  trash: S(
    '<path d="M4.6 7h14.8"/><path d="M9.6 7V5.5c0-.78.63-1.4 1.4-1.4h2c.78 0 1.4.62 1.4 1.4V7"/><path d="M6.6 7l.88 11.8a2 2 0 0 0 2 1.85h5.04a2 2 0 0 0 2-1.85L17.4 7"/>',
  ),
  star: S(
    '<path d="M12 4.3l2.45 4.96 5.48.8-3.96 3.86.93 5.45L12 16.8l-4.9 2.57.93-5.45L4.07 10.06l5.48-.8z"/>',
  ),
  starFill: S(
    '<path d="M12 4.3l2.45 4.96 5.48.8-3.96 3.86.93 5.45L12 16.8l-4.9 2.57.93-5.45L4.07 10.06l5.48-.8z"/>',
    { fill: true },
  ),
  reload: S(
    '<path d="M3.8 5.6v4.8h4.8"/><path d="M4.4 14.4a7.8 7.8 0 1 0 .86-6.6L3.8 10.4"/>',
  ),
  copy: S(
    '<rect x="9" y="9" width="11" height="11" rx="2.4"/><path d="M15.4 6.2V5.6A2.6 2.6 0 0 0 12.8 3H5.6A2.6 2.6 0 0 0 3 5.6v7.2a2.6 2.6 0 0 0 2.6 2.6h.6"/>',
  ),
  wand: S(
    '<path d="M5 19 17.4 6.6"/><path d="M15.2 4.4l.9 1.8 1.8.9-1.8.9-.9 1.8-.9-1.8-1.8-.9 1.8-.9z"/><path d="M5.4 5.4l.6 1.2 1.2.6-1.2.6-.6 1.2-.6-1.2L3.6 7.2l1.2-.6z"/>',
  ),
  search: S(
    '<circle cx="10.8" cy="10.8" r="6.2"/><path d="m15.4 15.4 4 4"/>',
  ),
  chevron: S('<path d="M9 6l6 6-6 6"/>', { w: 2 }),
  gripDown: S('<path d="M6 15l6-6 6 6"/>', { w: 2 }),
  settings: S(
    '<path d="M3.6 7.6h8.2M17.4 7.6h3"/><circle cx="15" cy="7.6" r="2.1"/><path d="M3.6 16.4h3M11.6 16.4h8.8"/><circle cx="9" cy="16.4" r="2.1"/>',
  ),
  sun: S(
    '<circle cx="12" cy="12" r="3.9"/><path d="M12 2.9v1.7M12 19.4v1.7M2.9 12h1.7M19.4 12h1.7M5.3 5.3l1.2 1.2M17.5 17.5l1.2 1.2M18.7 5.3l-1.2 1.2M6.5 17.5l-1.2 1.2"/>',
  ),
  moon: S('<path d="M20.4 14.6A8.5 8.5 0 0 1 9.4 3.6a8.5 8.5 0 1 0 11 11z"/>'),
  monitor: S(
    '<rect x="3" y="4.6" width="18" height="12.4" rx="2"/><path d="M9 20.4h6"/>',
  ),
  info: S('<circle cx="12" cy="12" r="8.4"/><path d="M12 11v5.2M12 8.1v.1"/>'),
  alert: S(
    '<path d="M12 4.6 21 19.4H3z"/><path d="M12 10v4M12 16.6v.1"/>',
  ),
  check: S('<path d="m5 12.8 4.6 4.6L19 7.4"/>', { w: 2 }),
  lock: S(
    '<rect x="4.6" y="10.2" width="14.8" height="10" rx="2.4"/><path d="M8.2 10.2V7.6a3.8 3.8 0 0 1 7.6 0v2.6"/>',
  ),
  mic: S(
    '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0"/><path d="M12 17.8V21"/>',
  ),
  wave: S(
    '<path d="M4 10.4v3.2M8 7.2v9.6M12 4.6v14.8M16 8.4v7.2M20 11v2"/>',
  ),
  sliders: S(
    '<path d="M5 5.5v13M12 5.5v13M19 5.5v13"/><circle cx="5" cy="9.6" r="1.9"/><circle cx="12" cy="14.4" r="1.9"/><circle cx="19" cy="8.4" r="1.9"/>',
  ),
  sparkle: S(
    '<path d="M12 3.6l1.9 5.1 5.1 1.9-5.1 1.9L12 17.6l-1.9-5.1L5 10.6l5.1-1.9z"/><path d="M18.6 16.4l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  ),
  stack: S(
    '<path d="M12 3.8 3.6 8.2 12 12.6l8.4-4.4z"/><path d="m3.6 12.6 8.4 4.4 8.4-4.4"/><path d="m3.6 16.8 8.4 4.4 8.4-4.4"/>',
  ),
};

/** Bare markup for an icon, safe to drop into a template string. */
export const ic = (name) => icons[name] || "";
