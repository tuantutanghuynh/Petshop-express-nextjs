import { apiFetch } from '../lib/apiClient';
import { bankInfo, type BankInfo } from '../lib/orders';
import { parseSocialLinks } from '../lib/storefront';
import { ApiRequestError } from '../lib/apiClient';
import type { BlogPost, GalleryItem, PageMeta, SiteSettings } from '../lib/types';

const REVALIDATE_SECONDS = 300;
const MAX_PAGE_SIZE = 50; // backend cap for GET /blog

// Public blog and gallery reads. Cached like the catalogue (5 minutes) and tagged, so the admin
// pages can refresh them the moment something is published (POST /api/revalidate). They used
// `cache: 'no-store'` before, because without that refresh a new post stayed invisible until the
// cache expired.
export async function getPostList(): Promise<BlogPost[]> {
  const { data } = await apiFetch<BlogPost[], PageMeta>(`/blog?page=1&pageSize=${MAX_PAGE_SIZE}`, {
    next: { revalidate: REVALIDATE_SECONDS, tags: ['blog'] },
  });
  return data;
}

// A published post, or null when the API says it does not exist (404). Any other failure is
// thrown: the page must not answer "not found" for a post that exists just because the API had a
// bad moment — that would be a soft 404 telling search engines the article is gone.
export async function getPost(slug: string): Promise<BlogPost | null> {
  try {
    const { data } = await apiFetch<BlogPost>(`/blog/${encodeURIComponent(slug)}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ['blog', `post:${slug}`] },
    });
    return data;
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) return null;
    throw err;
  }
}

export async function getGallery(): Promise<GalleryItem[]> {
  const { data } = await apiFetch<GalleryItem[]>('/gallery', { next: { revalidate: REVALIDATE_SECONDS, tags: ['gallery'] } });
  return data;
}

export async function getLatestPosts(limit: number): Promise<BlogPost[]> {
  const { data } = await apiFetch<BlogPost[], PageMeta>(`/blog?page=1&pageSize=${limit}`, {
    next: { revalidate: REVALIDATE_SECONDS, tags: ['blog'] },
  });
  return data;
}

// Every published post's slug and updatedAt, for the sitemap. Walks all pages: the API caps a
// page at 50, and the old sitemap silently stopped at the first 50 posts.
export async function getAllPostEntries(): Promise<{ slug: string; updatedAt: string }[]> {
  const out: { slug: string; updatedAt: string }[] = [];
  for (let page = 1; ; page += 1) {
    const { data, meta } = await apiFetch<BlogPost[], PageMeta>(`/blog?page=${page}&pageSize=${MAX_PAGE_SIZE}`, {
      next: { revalidate: 3600, tags: ['blog'] },
    });
    out.push(...data.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt })));
    if (data.length === 0 || page * MAX_PAGE_SIZE >= meta.total) return out;
  }
}

export async function getSettings(keys: string[]): Promise<SiteSettings> {
  const { data } = await apiFetch<SiteSettings>(`/settings?keys=${keys.map(encodeURIComponent).join(',')}`, {
    next: { revalidate: REVALIDATE_SECONDS, tags: ['settings'] },
  });
  return data;
}

export type ShopInfo = {
  phone?: string;
  zalo?: string;
  email?: string;
  address?: string;
  hours?: string;
  socialLinks: string[];
};

const SHOP_KEYS = ['shop_phone', 'shop_zalo', 'shop_email', 'shop_address', 'shop_hours', 'shop_social_links'];

// Contact details shown in the header, footer and Organization JSON-LD. Used by the root layout,
// so a failure here must not take every page down: it logs and returns no details, and the
// chrome simply leaves those lines out.
export async function getShopInfo(): Promise<ShopInfo> {
  try {
    const s = await getSettings(SHOP_KEYS);
    return {
      phone: s.shop_phone || undefined,
      zalo: s.shop_zalo || undefined,
      email: s.shop_email || undefined,
      address: s.shop_address || undefined,
      hours: s.shop_hours || undefined,
      socialLinks: parseSocialLinks(s.shop_social_links),
    };
  } catch (err) {
    console.error('getShopInfo: could not load shop settings', err);
    return { socialLinks: [] };
  }
}

// Account for bank transfers, or null — then checkout offers COD only (lib/orders.ts bankInfo).
// A failure is logged and treated as "not configured": better no transfer option than a wrong one.
export async function getBankInfo(): Promise<BankInfo | null> {
  try {
    return bankInfo(await getSettings(['bank_name', 'bank_account', 'bank_holder']));
  } catch (err) {
    console.error('getBankInfo: could not load bank settings', err);
    return null;
  }
}
