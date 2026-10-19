'use client';

import { useRouter } from 'next/navigation';
import { addToQuote, type QuoteItem } from '../../lib/quoteList';

type Props = { item: Omit<QuoteItem, 'quantity'>; quantity?: number; variant: 'button' | 'chip' };

// "Nhờ tư vấn" / "Hỏi giá": puts the product on the visitor's advice list and opens the quote form.
export function AskQuoteButton({ item, quantity = 1, variant }: Props) {
  const router = useRouter();
  function onClick() {
    addToQuote({ ...item, quantity });
    router.push('/tu-van-bao-gia');
  }
  if (variant === 'chip') {
    return (
      <button type="button" onClick={onClick} aria-label={`Hỏi giá: ${item.productName}`} className="relative z-10 inline-flex min-h-11 shrink-0 items-center rounded-full bg-mint px-3 text-xs font-bold text-brand-deep">
        Hỏi giá
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} className="min-h-12 rounded-full border-2 border-brand-ink px-6 font-bold text-brand-ink hover:bg-mint">
      Nhờ tư vấn
    </button>
  );
}
