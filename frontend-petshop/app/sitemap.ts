import type { MetadataRoute } from 'next';
import { apiFetch } from '../lib/apiClient';
import type { BlogPost } from '../lib/types';

const SITE_URL = 'https://miniecom-blog.vercel.app'; // TODO: thay domain thật ở Buổi 14

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data: posts } = await apiFetch<BlogPost[]>('/blog?pageSize=50', { cache: 'no-store' });

  const staticUrls = [
    { url: `${SITE_URL}/`, lastModified: new Date() },
    { url: `${SITE_URL}/blog`, lastModified: new Date() },
    { url: `${SITE_URL}/gallery`, lastModified: new Date() },
  ];

  const postUrls = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.updatedAt,
  }));

  return [...staticUrls, ...postUrls];
}
