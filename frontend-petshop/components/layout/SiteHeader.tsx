import { AnnouncementBar } from './AnnouncementBar';
import { Logo } from './Logo';
import { MainNav } from './MainNav';

type Props = { phone?: string };

// Search, account and cart icons from the wireframe are left out until those features exist
// (public search needs a backend `q` parameter; cart and account pages are not built yet).
export function SiteHeader({ phone }: Props) {
  return (
    <>
      <AnnouncementBar />
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-[1200px] items-center justify-between gap-3 px-4 lg:min-h-[76px]">
          <Logo />
          {phone && (
            <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-bold text-ink hover:bg-mint">
              <span aria-hidden="true">☎</span>
              <span className="hidden sm:inline">{phone}</span>
              <span className="sr-only sm:hidden">Gọi {phone}</span>
            </a>
          )}
        </div>
        <nav aria-label="Điều hướng chính" className="hidden border-t border-line md:block">
          <div className="mx-auto max-w-[1200px] px-4">
            <MainNav />
          </div>
        </nav>
      </header>
    </>
  );
}
