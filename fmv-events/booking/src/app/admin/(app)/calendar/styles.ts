/** Calendar colours by booking status (shared by the grid and the lanes). */
export const STATUS_STYLES: Record<string, string> = {
  held: 'border-warn/40 bg-warn-soft text-warn',
  confirmed: 'border-ok/40 bg-ok-soft text-ok',
  completed: 'border-line bg-cream-deep text-ink-soft',
  cancelled: 'border-bad/30 bg-bad-soft text-bad line-through',
};
