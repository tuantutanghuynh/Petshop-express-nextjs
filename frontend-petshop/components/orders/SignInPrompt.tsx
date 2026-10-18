import Link from 'next/link';

export function SignInPrompt({ next, text }: { next: string; text: string }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p>{text}</p>
      <Link href={`/dang-nhap?next=${encodeURIComponent(next)}`} className="inline-flex min-h-12 items-center rounded-full bg-brand-ink px-6 font-bold text-white">Đăng nhập</Link>
    </div>
  );
}
