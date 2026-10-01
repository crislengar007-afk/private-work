import { PageHeader } from '@/components/ui';
import { TabNav } from '@/app/admin/_owner/form';

const tabs = [
  { href: '/admin/catalog', label: 'Services', exact: true },
  { href: '/admin/catalog/packages', label: 'Packages' },
  { href: '/admin/catalog/addons', label: 'Add-ons' },
  { href: '/admin/catalog/inventory', label: 'Inventory' },
  { href: '/admin/catalog/zones', label: 'Travel zones' },
  { href: '/admin/catalog/blackouts', label: 'Blackout dates' },
];

// Each page below calls requireOwner() itself; this layout only adds the tabs.
export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader
        title="Catalog"
        description="Everything clients see and book: prices change on the public site within minutes of saving."
      />
      <TabNav tabs={tabs} label="Catalog sections" />
      {children}
    </div>
  );
}
