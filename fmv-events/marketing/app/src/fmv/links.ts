// Deep links into the booking app (Part B). When booking isn't configured yet,
// CTAs point at the on-page "booking opens soon" section instead.
export function bookHref(bookingUrl: string | null, path = "/build"): string {
  return bookingUrl ? `${bookingUrl}${path}` : "/contact#booking-soon";
}
