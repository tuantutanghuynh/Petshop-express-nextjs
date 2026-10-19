import Link from 'next/link';
import { categoryPath } from '../../lib/seo/structuredData';
import type { Category } from '../../lib/types';
import { AccountControl } from '../cart/AccountControl';
import { CartLink } from '../cart/CartLink';
import { SearchForm } from '../search/SearchForm';
import { AnnouncementBar } from './AnnouncementBar';
import { CategoryMenu } from './CategoryMenu';
import { Logo } from './Logo';
import { MainNav } from './MainNav';
import { MobileMenu } from './MobileMenu';
import { FEATURED_CATEGORY_SLUGS, MAIN_NAV, type NavLink } from './navLinks';

type Props = { phone?: string; announcements: string[] | null; categories: Category[] };

// Header as in the wireframe. Phone: ☰ (drawer) · logo · 🔍 · cart. From 768px: logo · search with
// category select · account · cart, and a menu row with the category dropdown, the links and the
// hotline. Only the small interactive parts are client components.
export function SiteHeader({ phone, announcements, categories }: Props) {
  // "Cho chó" / "Cho mèo" straight after "Sản phẩm", when those categories exist.
  const featured: NavLink[] = FEATURED_CATEGORY_SLUGS.flatMap((slug) => {
    const c = categories.find((cat) => cat.slug === slug);
    return c ? [{ href: categoryPath(c.slug), label: c.name, icon: '🐾' }] : [];
  });
  const links = [...MAIN_NAV.slice(0, 2), ...featured, ...MAIN_NAV.slice(2)];
  const tel = phone?.replace(/[^\d+]/g, '');

  return (
    <>
      <AnnouncementBar items={announcements} />
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        {/* Below 240px (200% zoom on a phone) the four 44px buttons only fit without gaps. */}
        <div className="mx-auto flex min-h-14 max-w-[1200px] items-center gap-2 px-4 max-[239px]:gap-0 max-[239px]:px-2 md:gap-6 md:px-6 lg:min-h-[76px]">
          <MobileMenu links={links} categories={categories} phone={phone} />
          <Logo />
          <div className="hidden min-w-0 flex-1 md:block"><SearchForm compact categories={categories} /></div>
          <div className="ml-auto flex shrink-0 items-center gap-1 max-[239px]:gap-0 md:ml-0">
            <Link href="/tim-kiem" aria-label="Tìm kiếm" className="grid size-11 place-items-center rounded-full text-xl hover:bg-mint md:hidden">
              <span aria-hidden="true">🔍</span>
            </Link>
            <span className="hidden md:contents"><AccountControl /></span>
            <CartLink />
          </div>
        </div>
        <nav aria-label="Điều hướng chính" className="hidden border-t border-line md:block">
          <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-1.5 md:px-6">
            {categories.length > 0 && <CategoryMenu categories={categories} />}
            <MainNav links={links} />
            {tel && (
              <a href={`tel:${tel}`} className="ml-auto hidden min-h-11 shrink-0 items-center gap-1 px-2 text-sm font-extrabold text-ink lg:flex">
                <span aria-hidden="true">☎</span> Hotline <span className="hidden xl:inline">{phone}</span>
              </a>
            )}
          </div>
        </nav>
      </header>
    </>
  );
}
