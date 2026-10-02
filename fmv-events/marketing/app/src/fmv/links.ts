// Deep links into the booking app (Part B). Without a booking app the links stay
// on this site: /build -> /book (the prototype builder, or a "booking opens soon"
// panel when the prototype is off) and /contact -> the contact page.
export function bookHref(bookingUrl: string | null, path = "/build"): string {
  if (bookingUrl) return `${bookingUrl}${path}`;
  if (path.startsWith("/build")) return `/book${path.slice("/build".length)}`;
  if (path.startsWith("/contact")) return "/contact#inquiry";
  return "/contact";
}
