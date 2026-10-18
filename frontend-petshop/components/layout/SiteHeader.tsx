import { AccountControl } from '../cart/AccountControl';
import { CartLink } from '../cart/CartLink';
import { AnnouncementBar } from './AnnouncementBar';
import { Logo } from './Logo';
import { MainNav } from './MainNav';

type Props = { phone?: string };

// Search from the wireframe is left out until the backend has a public `q` parameter.
export function SiteHeader({ phone }: Props) {
  return (
    <>
      <AnnouncementBar />
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-[1200px] items-center justify-between gap-3 px-4 lg:min-h-[76px]">
          <Logo />
          <div className="flex items-center gap-1">
          {phone && (
            <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-bold text-ink hover:bg-mint">
              <span aria-hidden="true">☎</span>
              <span className="hidden sm:inline">{phone}</span>
              <span className="sr-only sm:hidden">Gọi {phone}</span>
            </a>
          )}
            <span className="hidden md:contents"><AccountControl /></span>
            <CartLink />
          </div>
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
