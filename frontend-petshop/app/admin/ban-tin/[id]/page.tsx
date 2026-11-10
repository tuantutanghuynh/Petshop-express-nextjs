import type { Metadata } from 'next';
import Link from 'next/link';
import { CampaignScreen } from '../../../../components/admin/newsletter/CampaignScreen';

export const metadata: Metadata = { title: 'Bản tin' };

type Props = { params: Promise<{ id: string }> };

export default async function AdminCampaignPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/admin/ban-tin" className="inline-flex min-h-11 items-center underline">Bản tin</Link> › <span>Chi tiết</span>
      </nav>
      <h1 className="text-2xl leading-[1.3] font-extrabold">Bản tin</h1>
      <CampaignScreen id={id} />
    </div>
  );
}
