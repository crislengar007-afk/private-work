import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/cormorant-garamond';
import '@fontsource-variable/inter';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Book your event · FMV Events & Photography',
    template: '%s · FMV Events & Photography',
  },
  description:
    'Build your event, get a quote and book photography, wedding coordination, décor and photo booth rentals with FMV Events & Photography in Fredericton, New Brunswick.',
};

export const viewport: Viewport = {
  themeColor: '#fbf7f2',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
