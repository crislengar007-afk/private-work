import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/request';
import { listLiveCampaignSlugs } from '@/components/minis/data';

// Regenerated hourly so new/closed mini campaigns show up without a deploy.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    { url: appUrl('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: appUrl('/build'), lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: appUrl('/minis'), lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: appUrl('/policies'), lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: appUrl('/contact'), lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ];

  let minis: MetadataRoute.Sitemap = [];
  try {
    const slugs = await listLiveCampaignSlugs();
    minis = slugs.map((slug) => ({
      url: appUrl(`/minis/${encodeURIComponent(slug)}`),
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    }));
  } catch (e) {
    console.error('[sitemap] could not load mini campaigns', e instanceof Error ? e.message : e);
  }

  // Keep /minis/<slug> entries right after /minis.
  return [...staticPages.slice(0, 3), ...minis, ...staticPages.slice(3)];
}
