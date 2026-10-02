/**
 * Opening flourish for the Home hero: petals and small blossoms fly in from
 * the edges of the screen, swirl, and settle into the vase in the film,
 * shrinking and fading as they sink into the arrangement. Plays once per
 * page open, after load; never under reduced motion or with motion paused.
 *
 * Drawn in code (inline SVG, Web Animations API, transforms and opacity
 * only). The vase position is given in the poster's own coordinates and
 * mapped onto the screen through the same object-fit: cover crop.
 */

interface Target {
  /** Vase mouth, as a fraction of the image width and height. */
  x: number;
  y: number;
  /** Image aspect ratio (width / height). */
  ratio: number;
  /** object-position of the image, as fractions. */
  posX: number;
  posY: number;
}

const PALETTE = [
  ['#fffdf8', '#f1e6da'], // ivory rose
  ['#ffffff', '#ece8e1'], // white lily
  ['#fbeae6', '#efc9c6'], // blush
  ['#f8f1e8', '#e6d3c1'], // cream
  ['#fdf3f1', '#f3d7d9'], // pale pink
];
const LEAF = ['#b9cc97', '#8fa96d'];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

type Kind = 'petal' | 'blossom' | 'leaf' | 'rose' | 'lily';

function petalSvg(size: number, kind: Kind, id: number) {
  const [light, deep] = kind === 'leaf' ? LEAF : pick(PALETTE);
  const g = `g${id}`;
  const grad = `<defs><radialGradient id="${g}" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${deep}"/></radialGradient></defs>`;
  let body: string;
  if (kind === 'rose') {
    // A whole garden-rose head: two rings of cupped petals around a tight spiral.
    const ring = (n: number, r: number, rx: number, ry: number, rot: number) =>
      Array.from({ length: n }, (_, i) => {
        const a = rot + (i * 360) / n;
        const rad = (a * Math.PI) / 180;
        const cx = 12 + Math.sin(rad) * r;
        const cy = 12 - Math.cos(rad) * r;
        return `<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${rx}" ry="${ry}" transform="rotate(${a.toFixed(1)} ${cx.toFixed(2)} ${cy.toFixed(2)})" fill="url(#${g})" stroke="${deep}" stroke-width=".55"/>`;
      }).join('');
    body = `${ring(6, 6.4, 4.6, 5.4, 0)}${ring(5, 3.6, 3.4, 4, 36)}<path d="M12 9.2 C14.6 9.4 14.8 13 12.4 13.4 C10.4 13.7 10 11.4 11.6 11 C12.6 10.8 12.9 12 12.2 12.2" fill="none" stroke="${deep}" stroke-width=".8" stroke-linecap="round"/>`;
  } else if (kind === 'lily') {
    // A white lily seen from above: six pointed petals, a green throat and stamens.
    const petals = Array.from({ length: 6 }, (_, i) =>
      `<path d="M12 12 C7.8 8.6 9 3.4 12 .8 C15 3.4 16.2 8.6 12 12Z" transform="rotate(${i * 60} 12 12)" fill="url(#${g})" stroke="${deep}" stroke-width=".3"/>`,
    ).join('');
    const stamens = Array.from({ length: 6 }, (_, i) => {
      const rad = ((i * 60 + 30) * Math.PI) / 180;
      return `<line x1="12" y1="12" x2="${(12 + Math.sin(rad) * 4.4).toFixed(2)}" y2="${(12 - Math.cos(rad) * 4.4).toFixed(2)}" stroke="#c9b26a" stroke-width=".4"/><circle cx="${(12 + Math.sin(rad) * 4.6).toFixed(2)}" cy="${(12 - Math.cos(rad) * 4.6).toFixed(2)}" r=".7" fill="#a7783f"/>`;
    }).join('');
    body = `${petals}<circle cx="12" cy="12" r="2.2" fill="#cfe0a9" opacity=".9"/>${stamens}`;
  } else if (kind === 'blossom') {
    // Five rounded petals and a pale centre, like a snapdragon or waxflower floret.
    const petals = Array.from({ length: 5 }, (_, i) => {
      const a = (i * 72 * Math.PI) / 180;
      return `<ellipse cx="${12 + Math.sin(a) * 5.5}" cy="${12 - Math.cos(a) * 5.5}" rx="4.6" ry="5.6" transform="rotate(${i * 72} ${12 + Math.sin(a) * 5.5} ${12 - Math.cos(a) * 5.5})" fill="url(#${g})"/>`;
    }).join('');
    body = `${petals}<circle cx="12" cy="12" r="2.4" fill="#efe2a8"/>`;
  } else if (kind === 'leaf') {
    body = `<path d="M12 1 C19 6 20 15 12 23 C4 15 5 6 12 1Z" fill="url(#${g})"/><path d="M12 3 L12 21" stroke="#7d955c" stroke-width=".6" fill="none" opacity=".6"/>`;
  } else {
    // A rose petal: a soft, slightly cupped teardrop with a lit edge.
    body = `<path d="M12 23 C3.5 18 2 9 6 4.5 C8.6 1.6 11 2.6 12 4.2 C13 2.6 15.4 1.6 18 4.5 C22 9 20.5 18 12 23Z" fill="url(#${g})"/><path d="M6.5 6 C9 4.6 11 5.6 12 7.4" stroke="#ffffff" stroke-width=".7" fill="none" opacity=".7"/>`;
  }
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">${grad}${body}</svg>`;
}

/** Where the vase sits on screen, given the cover crop of its image. */
function vasePoint(box: DOMRect, t: Target) {
  const rw = Math.max(box.width, box.height * t.ratio);
  const rh = rw / t.ratio;
  const ox = (box.width - rw) * t.posX;
  const oy = (box.height - rh) * t.posY;
  return { x: ox + t.x * rw, y: oy + t.y * rh, w: rw };
}

function bezier(p0: number, p1: number, p2: number, p3: number, t: number) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

let played = false;

export function flyPetals(layer: HTMLElement, target: Target) {
  if (played) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const paused = document.documentElement.classList.contains('motion-paused');
  if (reduce || paused || !('animate' in Element.prototype)) return;
  played = true;

  const box = layer.getBoundingClientRect();
  const vase = vasePoint(box, target);
  const narrow = box.width < 700;
  const count = narrow ? 30 : 48;
  const spread = vase.w * (narrow ? 0.12 : 0.07);
  const animations: Animation[] = [];

  for (let i = 0; i < count; i++) {
    // About a third are whole blooms; the rest petals, florets and a few leaves.
    const kinds: Kind[] = ['rose', 'petal', 'lily', 'petal', 'blossom', 'petal', 'rose', 'petal', 'leaf'];
    const kind = kinds[i % kinds.length];
    const base = kind === 'rose' || kind === 'lily' ? (narrow ? rand(44, 70) : rand(70, 120)) : narrow ? rand(20, 34) : rand(30, 56);
    const size = Math.round(base);
    const el = document.createElement('span');
    el.className = 'petal';
    el.innerHTML = petalSvg(size, kind, i);
    el.style.width = el.style.height = `${size}px`;
    layer.append(el);

    // Start just off-screen: along the top, or high on either side.
    const edge = Math.random();
    const sx = edge < 0.6 ? rand(-0.05, 1.05) * box.width : edge < 0.8 ? -size * 2 : box.width + size * 2;
    const sy = edge < 0.6 ? -size * 2 - rand(0, box.height * 0.15) : rand(-0.1, 0.45) * box.height;
    // Land in the mouth of the vase, spread across the arrangement.
    const ex = vase.x + rand(-1, 1) * spread;
    const ey = vase.y - rand(0, narrow ? 0.12 : 0.1) * box.height;
    // A wide swirl: drift sideways first, then drop in from above the vase.
    const c1x = sx + rand(-0.35, 0.35) * box.width;
    const c1y = sy + rand(0.15, 0.45) * box.height;
    const c2x = ex + rand(-0.3, 0.3) * box.width;
    const c2y = ey - rand(0.25, 0.5) * box.height;
    const spin = rand(240, 720) * (Math.random() < 0.5 ? -1 : 1);
    const flutter = rand(2, 4);

    const frames: Keyframe[] = [];
    const steps = 14;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = bezier(sx, c1x, c2x, ex, t);
      const y = bezier(sy, c1y, c2y, ey, t);
      const flip = Math.cos(t * Math.PI * flutter);
      const sc = 1 - 0.72 * Math.pow(t, 2.6);
      frames.push({
        offset: t,
        transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) rotate(${(spin * t).toFixed(1)}deg) scale(${(sc * (kind === 'rose' || kind === 'lily' ? 0.8 + 0.2 * Math.abs(flip) : 0.45 + 0.55 * Math.abs(flip))).toFixed(3)}, ${sc.toFixed(3)})`,
        opacity: t < 0.08 ? t / 0.08 : t > 0.86 ? Math.max(0, (1 - t) / 0.14) : 1,
      });
    }
    const anim = el.animate(frames, {
      duration: rand(3400, 5000),
      delay: rand(0, 1800) + (i / count) * 700,
      easing: 'cubic-bezier(.33, .02, .25, 1)',
      fill: 'both',
    });
    anim.finished.then(() => el.remove(), () => el.remove());
    animations.push(anim);
  }

  // The site-wide Pause stops the flourish at once.
  const stop = () => {
    animations.forEach((a) => a.cancel());
    layer.replaceChildren();
  };
  document.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-motion-toggle]')) stop();
  });
}
