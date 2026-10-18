type Props = { message: string; tone?: 'empty' | 'error' };

// Shared empty / error box for list sections. role="status" so screen readers announce it.
export function EmptyState({ message, tone = 'empty' }: Props) {
  return (
    <p role="status" className={`rounded-card px-4 py-6 text-center text-sm ${tone === 'error' ? 'bg-pink-bg text-pink-ink' : 'bg-surface-alt text-muted'}`}>
      {message}
    </p>
  );
}
