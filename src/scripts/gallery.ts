/**
 * Gallery behaviour: collection filters with FLIP transitions, and a
 * full-screen viewer with keyboard, swipe and history support. Photographs
 * with a labelled motion version play it in the viewer, with a switch back to
 * the still, and the viewer can take over the whole screen.
 *
 * State lives in the URL (?collection=…&view=…) so the browser's Back
 * button, reloads and returning from the Contact page restore both the
 * filter and the open photograph. Scroll position is restored by the
 * browser because the page layout is stable.
 */

interface ViewerItem {
  id: string;
  alt: string;
  caption: string;
  collection: string;
  collectionLabel: string;
  width: number;
  height: number;
  src: string;
  srcset: string;
  motion: { src: string; type: string }[];
}

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function initGallery() {
  const rootEl = document.querySelector<HTMLElement>('[data-gallery]');
  const gridEl = document.querySelector<HTMLUListElement>('[data-grid]');
  const dataEl = document.getElementById('gallery-data');
  if (!rootEl || !gridEl || !dataEl) return;
  const root: HTMLElement = rootEl;
  const grid: HTMLUListElement = gridEl;

  const data: ViewerItem[] = JSON.parse(dataEl.textContent || '[]');
  const byId = new Map(data.map((d) => [d.id, d]));
  const items = Array.from(grid.querySelectorAll<HTMLLIElement>('.item'));
  const filterButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-filter]'));
  const status = root.querySelector<HTMLElement>('[data-filter-status]');
  const empty = root.querySelector<HTMLElement>('[data-empty]');
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  let current = '';
  let busy: Promise<void> = Promise.resolve();

  const labelFor = (id: string) => filterButtons.find((b) => b.dataset.filter === id)?.dataset.label ?? '';

  const visibleItems = () => items.filter((el) => !el.hidden);

  function setUrl(params: Record<string, string | null>, push = false) {
    const url = new URL(location.href);
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    const state = { ...(history.state ?? {}), gallery: true };
    if (push) history.pushState(state, '', url);
    else history.replaceState(state, '', url);
  }

  function updateFilterUi(id: string) {
    for (const b of filterButtons) b.setAttribute('aria-pressed', String((b.dataset.filter ?? '') === id));
    const count = visibleItems().length;
    if (status) {
      const noun = count === 1 ? 'photograph' : 'photographs';
      status.textContent = id ? `${count} ${noun} in ${labelFor(id)}` : `${count} ${noun}`;
    }
    if (empty) empty.hidden = count > 0;
  }

  function applyVisibility(id: string) {
    for (const el of items) {
      const show = !id || el.dataset.collection === id;
      el.hidden = !show;
      el.classList.toggle('is-shown', show);
    }
  }

  async function filterTo(id: string, animate = true) {
    if (id === current && animate) return;
    current = id;

    if (!animate || reduceMotion() || !('animate' in Element.prototype)) {
      applyVisibility(id);
      updateFilterUi(id);
      return;
    }

    // First: remember where everything is, and hold the page height steady.
    const before = new Map(items.filter((el) => !el.hidden).map((el) => [el, el.getBoundingClientRect()]));
    grid.style.minHeight = `${grid.offsetHeight}px`;

    const leaving = items.filter((el) => !el.hidden && id && el.dataset.collection !== id);
    await Promise.all(
      leaving.map(
        (el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: EASE, fill: 'forwards' }).finished,
      ),
    );

    // Last: switch the layout, then Invert and Play.
    applyVisibility(id);
    leaving.forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    updateFilterUi(id);

    const shown = visibleItems();
    const animations = shown.map((el, i) => {
      const prev = before.get(el);
      const next = el.getBoundingClientRect();
      if (prev) {
        const dx = prev.left - next.left;
        const dy = prev.top - next.top;
        const scale = prev.width / next.width;
        return el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, transformOrigin: 'top left' },
            { transform: 'none', transformOrigin: 'top left' },
          ],
          { duration: 700, easing: EASE },
        ).finished;
      }
      return el.animate(
        [
          { opacity: 0, transform: 'translateY(24px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 700, delay: Math.min(i, 6) * 60, easing: EASE, fill: 'backwards' },
      ).finished;
    });

    // Keep the filters in view if the new set is shorter than where we were.
    const top = root.getBoundingClientRect().top;
    if (top < 0) root.scrollIntoView({ block: 'start', behavior: 'smooth' });

    await Promise.allSettled(animations);
    grid.style.minHeight = '';
  }

  for (const button of filterButtons) {
    button.addEventListener('click', () => {
      const id = button.dataset.filter ?? '';
      if (id === current) return;
      // Each filter is a history step, so Back returns to the previous view.
      setUrl({ collection: id || null, view: null }, true);
      busy = busy.then(() => filterTo(id));
    });
  }

  // Viewer ------------------------------------------------------------------

  const viewer = document.querySelector<HTMLDialogElement>('[data-viewer]');
  if (!viewer) return;
  const img = viewer.querySelector<HTMLImageElement>('[data-img]')!;
  const figure = viewer.querySelector<HTMLElement>('[data-figure]')!;
  const caption = viewer.querySelector<HTMLElement>('[data-caption]')!;
  const count = viewer.querySelector<HTMLElement>('[data-count]')!;
  const enquire = viewer.querySelector<HTMLAnchorElement>('[data-enquire]')!;
  const stage = viewer.querySelector<HTMLElement>('[data-stage]')!;
  const video = viewer.querySelector<HTMLVideoElement>('[data-viewer-video]')!;
  const motionNote = viewer.querySelector<HTMLElement>('[data-motion-note]')!;
  const motionSwitch = viewer.querySelector<HTMLButtonElement>('[data-motion-switch]')!;
  const fullscreen = viewer.querySelector<HTMLButtonElement>('[data-fullscreen]')!;
  const fullscreenLabel = viewer.querySelector<HTMLElement>('[data-fullscreen-label]')!;

  // Motion in the viewer follows the site-wide pause and reduced-motion
  // preference; the switch lets a visitor compare with the still photograph.
  let showMotion = true;
  const motionAllowed = () => !reduceMotion() && !document.documentElement.classList.contains('motion-paused');

  function clearMotion() {
    video.pause();
    video.classList.remove('is-playing');
    video.replaceChildren();
    video.removeAttribute('src');
    video.load();
    video.hidden = true;
  }

  function setMotion(item: ViewerItem) {
    clearMotion();
    const has = item.motion.length > 0 && motionAllowed();
    motionNote.hidden = !has;
    if (!has) return;
    motionSwitch.setAttribute('aria-pressed', String(showMotion));
    motionSwitch.textContent = showMotion ? 'Show the still photograph' : 'Show with motion';
    if (!showMotion) return;
    for (const s of item.motion) {
      const source = document.createElement('source');
      source.src = s.src;
      source.type = s.type;
      video.append(source);
    }
    video.style.maxWidth = `min(100%, ${item.width}px)`;
    video.style.maxHeight = `min(100%, ${item.height}px)`;
    video.hidden = false;
    video.load();
    video.addEventListener('playing', () => video.classList.add('is-playing'), { once: true });
    video.play().catch(() => {
      /* Autoplay refused: the still photograph remains. */
    });
  }

  motionSwitch.addEventListener('click', () => {
    showMotion = !showMotion;
    const item = byId.get(sequence()[index]);
    if (item) setMotion(item);
  });

  // Full screen, where the browser allows it.
  const canFullscreen = document.fullscreenEnabled && typeof viewer.requestFullscreen === 'function';
  fullscreen.hidden = !canFullscreen;
  const syncFullscreen = () => {
    const on = document.fullscreenElement === viewer;
    fullscreen.setAttribute('aria-pressed', String(on));
    fullscreenLabel.textContent = on ? 'Exit full screen' : 'Full screen';
  };
  fullscreen.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else viewer.requestFullscreen().catch(() => (fullscreen.hidden = true));
  });
  document.addEventListener('fullscreenchange', syncFullscreen);

  let index = -1;
  let opener: HTMLElement | null = null;
  let pushedHistory = false;
  let token = 0;

  const sequence = () => visibleItems().map((el) => el.dataset.id!);

  function describe(item: ViewerItem) {
    return [item.caption, item.collectionLabel].filter(Boolean).join(' · ') || item.alt;
  }

  function preload(id?: string) {
    const item = id ? byId.get(id) : undefined;
    if (!item) return;
    const pre = new Image();
    pre.sizes = `${item.width}px`;
    pre.srcset = item.srcset;
    pre.src = item.src;
  }

  async function show(nextIndex: number, dir: 'next' | 'prev' | 'none') {
    const ids = sequence();
    if (!ids.length) return;
    index = (nextIndex + ids.length) % ids.length;
    const item = byId.get(ids[index])!;
    const my = ++token;

    const animate = dir !== 'none' && !reduceMotion();
    if (animate) {
      figure.dataset.dir = dir;
      figure.classList.add('is-changing');
      await new Promise((r) => setTimeout(r, 200));
      if (my !== token) return;
    }

    img.hidden = false;
    img.removeAttribute('srcset');
    img.sizes = `${item.width}px`;
    img.srcset = item.srcset;
    img.src = item.src;
    img.alt = item.alt;
    img.width = item.width;
    img.height = item.height;
    // Never show a photograph larger than its original pixels.
    img.style.maxWidth = `min(100%, ${item.width}px)`;
    img.style.maxHeight = `min(100%, ${item.height}px)`;
    try {
      await img.decode();
    } catch {
      /* Show whatever arrived. */
    }
    if (my !== token) return;

    setMotion(item);
    caption.textContent = describe(item);
    count.textContent = `${index + 1} of ${ids.length}`;
    enquire.href = `/contact/?piece=${encodeURIComponent(item.id)}`;

    figure.classList.remove('is-changing');
    delete figure.dataset.dir;

    setUrl({ view: item.id });
    preload(ids[(index + 1) % ids.length]);
    preload(ids[(index - 1 + ids.length) % ids.length]);
  }

  function open(id: string, trigger: HTMLElement | null, pushState: boolean) {
    const ids = sequence();
    let at = ids.indexOf(id);
    if (at < 0) {
      // A photograph outside the current filter: show everything.
      setUrl({ collection: null });
      void filterTo('', false);
      at = sequence().indexOf(id);
    }
    if (at < 0) return;
    opener = trigger;
    if (!viewer!.open) {
      if (pushState) {
        setUrl({ view: id }, true);
        pushedHistory = true;
      }
      viewer!.showModal();
      document.documentElement.style.overflow = 'hidden';
    }
    void show(at, 'none');
  }

  function close() {
    if (viewer!.open) viewer!.close();
  }

  viewer.addEventListener('close', () => {
    document.documentElement.style.overflow = '';
    clearMotion();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    token++;
    const id = sequence()[index];
    if (pushedHistory && new URL(location.href).searchParams.has('view')) {
      pushedHistory = false;
      history.back();
    } else {
      pushedHistory = false;
      setUrl({ view: null });
    }
    const target = opener ?? (id ? grid.querySelector<HTMLElement>(`[data-open="${CSS.escape(id)}"]`) : null);
    target?.focus({ preventScroll: false });
    opener = null;
    index = -1;
  });

  grid.addEventListener('click', (e) => {
    const trigger = (e.target as HTMLElement).closest<HTMLElement>('[data-open]');
    if (!trigger) return;
    open(trigger.dataset.open!, trigger, true);
  });

  // Remember the selection too, in case the query string is lost on the way.
  enquire.addEventListener('click', () => {
    const id = sequence()[index];
    try {
      if (id) sessionStorage.setItem('fs-enquiry-piece', id);
    } catch {
      /* Storage unavailable: the link still carries ?piece=. */
    }
  });

  viewer.querySelector('[data-close]')!.addEventListener('click', () => close());
  viewer.querySelector('[data-prev]')!.addEventListener('click', () => void show(index - 1, 'prev'));
  viewer.querySelector('[data-next]')!.addEventListener('click', () => void show(index + 1, 'next'));

  viewer.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        void show(index + 1, 'next');
        break;
      case 'ArrowLeft':
        e.preventDefault();
        void show(index - 1, 'prev');
        break;
      case 'Home':
        e.preventDefault();
        void show(0, 'prev');
        break;
      case 'End':
        e.preventDefault();
        void show(sequence().length - 1, 'next');
        break;
      // Escape is handled natively by <dialog> and fires "close".
    }
  });

  // Clicking the dark surround (not the photograph or controls) closes.
  stage.addEventListener('click', (e) => {
    if (e.target === stage || e.target === figure) close();
  });

  // Swipe: horizontal travel of 48px or more, clearly more horizontal than vertical.
  let startX = 0;
  let startY = 0;
  let tracking = false;
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
  });
  stage.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      void show(dx < 0 ? index + 1 : index - 1, dx < 0 ? 'next' : 'prev');
    }
  });
  stage.addEventListener('pointercancel', () => (tracking = false));

  // History: Back closes the viewer; Forward reopens it.
  window.addEventListener('popstate', () => {
    const params = new URL(location.href).searchParams;
    const view = params.get('view');
    const collection = params.get('collection') ?? '';
    if (collection !== current) void filterTo(collection, false);
    if (view && byId.has(view)) {
      if (!viewer.open) open(view, null, false);
      else void show(sequence().indexOf(view), 'none');
    } else if (viewer.open) {
      pushedHistory = false;
      viewer.close();
    }
  });

  // Initial state from the URL.
  const params = new URL(location.href).searchParams;
  const initialCollection = params.get('collection') ?? '';
  if (initialCollection && filterButtons.some((b) => b.dataset.filter === initialCollection)) {
    void filterTo(initialCollection, false);
  } else {
    updateFilterUi('');
  }
  const initialView = params.get('view');
  if (initialView && byId.has(initialView)) open(initialView, null, false);
}
