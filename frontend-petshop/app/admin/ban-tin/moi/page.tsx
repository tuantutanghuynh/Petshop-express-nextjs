import type { Metadata } from 'next';
import Link from 'next/link';
import { CampaignScreen } from '../../../../components/admin/newsletter/CampaignScreen';

export const metadata: Metadata = { title: 'Soạn bản tin' };

export default function AdminNewCampaignPage() {
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/admin/ban-tin" className="inline-flex min-h-11 items-center underline">Bản tin</Link> › <span>Soạn bản tin</span>
      </nav>
      <h1 className="text-2xl leading-[1.3] font-extrabold">Soạn bản tin</h1>
      <CampaignScreen />
    </div>
  );
}
