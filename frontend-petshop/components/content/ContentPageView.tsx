import { notFound } from 'next/navigation';
import { renderArticle } from '../../lib/blog';
import { breadcrumbJsonLd, type Crumb } from '../../lib/seo/structuredData';
import { siteUrl } from '../../lib/site';
import { getContentPages } from '../../services/content';
import { JsonLd } from '../seo/JsonLd';
import { Breadcrumb } from '../ui/Breadcrumb';

// An owner-written page (about, policies): Markdown from /admin/cau-hinh, sanitised like articles.
// No text yet → a real 404, never placeholder copy.
export async function ContentPageView({ path }: { path: string }) {
  const page = (await getContentPages()).find((p) => p.path === path);
  if (!page) notFound();
  const { html } = renderArticle(page.markdown);
  const crumbs: Crumb[] = [{ name: 'Trang chủ', path: '/' }, { name: page.title }];
  return (
    <main id="main" className="mx-auto max-w-[1200px] px-4 pb-8 md:px-6">
      <JsonLd data={breadcrumbJsonLd(siteUrl(), crumbs)} />
      <Breadcrumb crumbs={crumbs} />
      <h1 className="mb-6 text-[clamp(1.5rem,1.1rem+1.6vw,2.1rem)] font-extrabold">{page.title}</h1>
      <div className="article-prose" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
