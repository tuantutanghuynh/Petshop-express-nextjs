// Form-level message (wrong password, rate limited, network). role="alert" is announced at once.
export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink">{message}</p>;
}
