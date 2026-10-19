import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContentPageView } from '../../../components/content/ContentPageView';
import { CONTENT_PAGES } from '../../../lib/settings';

type Props = { params: Promise<{ slug: string }> };

const policy = (slug: string) => CONTENT_PAGES.find((p) => p.path === `/chinh-sach/${slug}`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = policy((await params).slug);
  if (!page) return { title: 'Không tìm thấy', robots: { index: false } };
  return { title: page.title, description: page.description, alternates: { canonical: page.path } };
}

export default async function PolicyPage({ params }: Props) {
  const page = policy((await params).slug);
  if (!page) notFound();
  return <ContentPageView path={page.path} />;
}
