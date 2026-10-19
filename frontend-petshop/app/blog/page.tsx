import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FeaturedPost } from '../../components/blog/FeaturedPost';
import { PostCard } from '../../components/blog/PostCard';
import { TopicChips } from '../../components/blog/TopicChips';
import { JsonLd } from '../../components/seo/JsonLd';
import { Breadcrumb } from '../../components/ui/Breadcrumb';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pagination } from '../../components/ui/Pagination';
import { blogListHref, parseTopicParam, postCategories } from '../../lib/blog';
import { pageCount, parsePageParam } from '../../lib/pagination';
import { breadcrumbJsonLd, type Crumb } from '../../lib/seo/structuredData';
import { SITE_NAME, siteUrl } from '../../lib/site';
import { BLOG_PAGE_SIZE, getPostList, getPostPage } from '../../services/content';

// Search intent: informational. Cached for 5 minutes and refreshed at once when the admin publishes.
type Props = { searchParams: Promise<{ page?: string | string[]; 'chu-de'?: string | string[] }> };

const TITLE = 'Kiến thức chăm sóc chó mèo';
const DESCRIPTION = `Dinh dưỡng, sức khoẻ, thú y và mẹo chăm sóc chó mèo hằng ngày từ ${SITE_NAME} — viết bởi người nuôi, có nguồn tham khảo.`;

async function readParams(searchParams: Props['searchParams']) {
  const sp = await searchParams;
  return { page: parsePageParam(sp.page), topic: parseTopicParam(sp['chu-de']) };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { page, topic } = await readParams(searchParams);
  if (page === null || topic === null) return { title: 'Không tìm thấy', robots: { index: false } };
  const filtered = Boolean(topic) || page > 1;
  return {
    title: page > 1 ? `${TITLE} – Trang ${page}` : TITLE,
    description: DESCRIPTION,
    // A topic filter or page 2+ lists the same posts as /blog: canonical to /blog (topic) or itself
    // (page), never indexed, links still followed (ADR-013).
    alternates: { canonical: topic ? '/blog' : blogListHref({ page }) },
    ...(filtered && { robots: { index: false, follow: true } }),
    openGraph: { title: TITLE, description: DESCRIPTION, url: '/blog' },
  };
}

export default async function BlogListPage({ searchParams }: Props) {
  const { page, topic } = await readParams(searchParams);
  if (page === null || topic === null) notFound();

  const [result, recent] = await Promise.all([getPostPage(page, topic), getPostList()]);
  if (!result) notFound(); // unknown topic slug
  const totalPages = pageCount(result.total, BLOG_PAGE_SIZE);
  if (result.total > 0 && page > totalPages) notFound();

  const topics = postCategories(recent);
  const currentTopic = topics.find((t) => t.slug === topic);
  const crumbs: Crumb[] = [{ name: 'Trang chủ', path: '/' }, { name: 'Kiến thức' }];
  const [featured, ...rest] = page === 1 ? result.posts : [undefined, ...result.posts];

  return (
    <div className="flex flex-col gap-6">
      <JsonLd data={breadcrumbJsonLd(siteUrl(), crumbs)} />
      <div>
        <Breadcrumb crumbs={crumbs} />
        <h1 className="text-[clamp(1.5rem,1.1rem+1.6vw,2.1rem)] font-extrabold">{TITLE}</h1>
        <p className="mt-2 max-w-prose">{DESCRIPTION}</p>
      </div>
      <TopicChips topics={topics} current={topic} />

      {result.posts.length === 0 ? (
        <EmptyState message={currentTopic ? `Chưa có bài trong chủ đề “${currentTopic.name}”.` : 'Bài viết đầu tiên sắp ra mắt.'} />
      ) : (
        <>
          {featured && <FeaturedPost post={featured} />}
          {rest.length > 0 && (
            <section aria-labelledby="posts-title">
              <h2 id="posts-title" className="sr-only">Bài viết</h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((post) => post && <li key={post.id}><PostCard post={post} /></li>)}
              </ul>
            </section>
          )}
          <Pagination hrefFor={(p) => blogListHref({ topic, page: p })} page={page} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}
