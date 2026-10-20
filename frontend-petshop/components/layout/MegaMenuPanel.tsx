import Image from 'next/image';
import Link from 'next/link';
import type { CategoryNode } from '../../lib/categoryTree';
import { listHref } from '../../lib/catalogParams';
import type { MegaMenuExtras } from '../../lib/megaMenu';
import { categoryPath } from '../../lib/seo/structuredData';
import { imageSrc } from '../../lib/storefront';

// Contents of one species menu: a column per group with its leaves, featured brands below, the
// owner's banner on the right. Plain links rendered on the server. Images go through imageSrc():
// a URL from a host next/image does not allow falls back to text instead of breaking the header.
export function MegaMenuPanel({ node, extras }: { node: CategoryNode; extras: MegaMenuExtras }) {
  const speciesPath = categoryPath(node.slug);
  const bannerSrc = extras.banner ? imageSrc(extras.banner.image) : null;
  return (
    // The banner column exists only when there is a banner, so the groups get the full width otherwise.
    <div className={`mx-auto grid max-w-[1200px] gap-6 px-6 py-6 ${bannerSrc ? 'lg:grid-cols-[1fr_220px]' : ''}`}>
      <div className="min-w-0">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-6 gap-y-5">
          {node.children.map((group) => (
            <div key={group.id} className="min-w-0">
              <Link href={categoryPath(group.slug)} className="block py-1 text-sm leading-[1.4] font-extrabold tracking-wide text-ink uppercase hover:text-brand-ink">
                {group.name}
              </Link>
              {group.children.length > 0 && (
                <ul className="mt-1">
                  {group.children.map((leaf) => (
                    <li key={leaf.id}>
                      <Link href={categoryPath(leaf.slug)} className="flex min-h-9 items-center text-sm text-muted hover:text-brand-ink">{leaf.name}</Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={categoryPath(group.slug)} className="mt-1 inline-flex min-h-9 items-center text-sm font-bold text-brand-ink">
                Xem tất cả {group.name} <span aria-hidden="true" className="ml-1">→</span>
              </Link>
            </div>
          ))}
        </div>
        {extras.brands.length > 0 && (
          <div className="mt-6 border-t border-line pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-ink">Thương hiệu nổi bật</p>
              <Link href={speciesPath} className="inline-flex min-h-9 items-center text-sm font-bold text-brand-ink">Xem tất cả <span aria-hidden="true" className="ml-1">→</span></Link>
            </div>
            <ul className="grid grid-cols-4 gap-3">
              {extras.brands.map((b) => {
                const logo = imageSrc(b.logo);
                return (
                  <li key={b.name}>
                    <Link href={listHref(speciesPath, { brand: b.name })}
                      className="grid h-16 place-items-center rounded-card border border-line bg-surface px-3 text-center text-sm font-bold text-ink hover:border-brand-ink">
                      {logo ? <Image src={logo} alt={b.name} width={120} height={48} className="max-h-12 w-auto object-contain" /> : b.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      {extras.banner && bannerSrc && (
        <Link href={extras.banner.href ?? speciesPath} className="relative hidden min-h-80 overflow-hidden rounded-card bg-surface-alt lg:block">
          <Image src={bannerSrc} alt={extras.banner.title || node.name} fill sizes="220px" className="object-cover" />
          {extras.banner.title && (
            <span className="absolute inset-x-0 bottom-0 bg-ink/60 p-3 text-sm leading-[1.4] font-bold text-white">{extras.banner.title}</span>
          )}
        </Link>
      )}
    </div>
  );
}
