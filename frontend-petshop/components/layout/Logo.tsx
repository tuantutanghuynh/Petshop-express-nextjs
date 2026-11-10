import Image from 'next/image';
import Link from 'next/link';
import { BRAND_LOGO, LOGO_HORIZONTAL_SIZE, LOGO_ICON_SIZE } from '../../lib/brand';
import { SITE_NAME, SITE_TAGLINE } from '../../lib/site';

type Props = { placement?: 'header' | 'footer' };

// The brand logo files, used as delivered (brand guide v1.0: no recolouring, no retyped name).
// The guide's minimum is 140px wide for the horizontal logo and 32px for the icon, so the phone
// header, which also holds ☰, 🔍 and the cart in 320px, shows the icon alone below 400px, the
// horizontal logo at 32px high (194px wide) up to 640px, then at 40px. The footer has the room for
// the horizontal logo at every width. The images are decorative: the link carries the name.
export function Logo({ placement = 'header' }: Props) {
  const isHeader = placement === 'header';
  return (
    <Link href="/" className="flex min-h-11 min-w-11 shrink-0 items-center" aria-label={`${SITE_NAME} – ${SITE_TAGLINE} – Trang chủ`}>
      {isHeader && (
        <Image src={BRAND_LOGO.icon} alt="" width={LOGO_ICON_SIZE.width} height={LOGO_ICON_SIZE.height} unoptimized
          className="h-10 w-auto min-[400px]:hidden" />
      )}
      <Image src={BRAND_LOGO.horizontal} alt="" width={LOGO_HORIZONTAL_SIZE.width} height={LOGO_HORIZONTAL_SIZE.height} unoptimized
        className={isHeader ? 'hidden h-8 w-auto min-[400px]:block sm:h-10' : 'h-10 w-auto'} />
    </Link>
  );
}
