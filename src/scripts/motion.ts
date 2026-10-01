/**
 * Moving imagery. Every clip is decorative and muted; a still poster is
 * always present underneath, so nothing depends on a video loading.
 *
 * Clips load only when motion is welcome (no reduced-motion preference, no
 * Save-Data) and never before the page has finished loading, so the poster
 * stays the largest paint. One site-wide "Pause motion" control stops every
 * clip and is remembered for the visit (WCAG 2.2.2).
 *
 * Markup: <video data-motion="hero|hover|inview" data-wide='[{src,type}]'
 * data-narrow='[{src,type}]'> inside an element with [data-motion-root].
 *  - hero:   plays as soon as the page has loaded.
 *  - hover:  plays while its card is hovered or focused; on touch screens,
 *            while the card is centred in view.
 *  - inview: plays while at least half of it is on screen.
 *  - open:   on wide screens, played by its owner through wantVideo() (the
 *            Home reel plays its open card); on small screens, like hover.
 */

interface Source {
  src: string;
  type: string;
}

const STORE = 'fs-motion';
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const narrow = matchMedia('(max-width: 860px)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

let paused = (() => {
  try {
    return sessionStorage.getItem(STORE) === 'paused';
  } catch {
    return false;
  }
})();

const videos = new Set<HTMLVideoElement>();
const wanted = new WeakMap<HTMLVideoElement, boolean>();

const allowed = () => !reduce.matches && !saveData;

function load(video: HTMLVideoElement) {
  if (video.dataset.loaded) return;
  const list: Source[] = JSON.parse((narrow.matches && video.dataset.narrow) || video.dataset.wide || '[]');
  if (!list.length) return;
  video.dataset.loaded = '1';
  for (const s of list) {
    const source = document.createElement('source');
    source.src = s.src;
    source.type = s.type;
    video.append(source);
  }
  video.addEventListener('playing', () => video.closest('[data-motion-root]')?.classList.add('is-moving'));
  video.load();
}

function sync(video: HTMLVideoElement) {
  const want = wanted.get(video) === true && allowed() && !paused;
  if (want) {
    load(video);
    video.play().catch(() => {
      /* Autoplay refused: the poster remains. */
    });
  } else if (!video.paused) {
    video.pause();
  }
}

function want(video: HTMLVideoElement, value: boolean) {
  videos.add(video);
  wanted.set(video, value);
  sync(video);
}

/** Ask for a clip to play or stop; pause and reduced motion still apply. */
export const wantVideo = want;

function updateToggles() {
  document.querySelectorAll<HTMLButtonElement>('[data-motion-toggle]').forEach((b) => {
    b.hidden = !allowed();
    b.setAttribute('aria-pressed', String(paused));
    const label = b.querySelector('[data-motion-label]') ?? b;
    label.textContent = paused ? 'Play motion' : 'Pause motion';
  });
  document.documentElement.classList.toggle('motion-paused', paused);
}

export function initMotion() {
  const found = document.querySelectorAll<HTMLVideoElement>('video[data-motion]');
  if (!found.length) return;

  const inview = new IntersectionObserver(
    (entries) => {
      for (const e of entries) want(e.target as HTMLVideoElement, e.intersectionRatio >= 0.5);
    },
    { threshold: [0, 0.5, 1] },
  );

  // Touch screens: a card plays while it sits in the middle band of the view.
  const centred = new IntersectionObserver(
    (entries) => {
      for (const e of entries) want(e.target as HTMLVideoElement, e.isIntersecting);
    },
    { rootMargin: '-35% -20% -35% -20%' },
  );

  const begin = () => {
    for (const video of found) {
      videos.add(video);
      const mode = video.dataset.motion;
      if (mode === 'hero') {
        want(video, true);
        // Stop decoding while the hero is scrolled far away.
        new IntersectionObserver(([e]) => want(video, e.isIntersecting)).observe(video);
      } else if (mode === 'inview') {
        inview.observe(video);
      } else if (mode === 'open' && matchMedia('(min-width: 1024px)').matches) {
        /* Driven by its owner. */
      } else if (mode === 'hover' || mode === 'open') {
        const card = video.closest<HTMLElement>('[data-motion-root]') ?? video;
        const on = () => want(video, true);
        const off = () => want(video, false);
        card.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && on());
        card.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && off());
        card.addEventListener('focusin', on);
        card.addEventListener('focusout', off);
        // A pointer or focus that arrived before the listeners did still counts.
        if (card.matches(':hover') || card.contains(document.activeElement)) on();
        if (!finePointer.matches) centred.observe(video);
      }
    }
  };

  if (document.readyState === 'complete') setTimeout(begin, 300);
  else addEventListener('load', () => setTimeout(begin, 300), { once: true });

  document.querySelectorAll<HTMLButtonElement>('[data-motion-toggle]').forEach((b) =>
    b.addEventListener('click', () => {
      paused = !paused;
      try {
        sessionStorage.setItem(STORE, paused ? 'paused' : 'playing');
      } catch {
        /* Not remembered; the control still works on this page. */
      }
      updateToggles();
      videos.forEach(sync);
    }),
  );
  updateToggles();

  reduce.addEventListener('change', () => {
    updateToggles();
    videos.forEach(sync);
  });
}
