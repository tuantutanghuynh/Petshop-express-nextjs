import type { MetadataRoute } from 'next';
import { buildRobots } from '../lib/seo/robots';
import { siteUrl } from '../lib/site';

// Replaces the static public/robots.txt, whose hardcoded legacy domain pointed crawlers at a
// sitemap on another site. Rules live in lib/seo/robots.ts (unit tested).
export default function robots(): MetadataRoute.Robots {
  return buildRobots(siteUrl());
}
