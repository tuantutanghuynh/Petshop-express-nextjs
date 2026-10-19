import type { Metadata } from 'next';
import { ContentPageView } from '../../components/content/ContentPageView';
import { ABOUT_PAGE } from '../../lib/settings';

export const metadata: Metadata = { title: ABOUT_PAGE.title, description: ABOUT_PAGE.description, alternates: { canonical: ABOUT_PAGE.path } };

export default function AboutPage() {
  return <ContentPageView path={ABOUT_PAGE.path} />;
}
