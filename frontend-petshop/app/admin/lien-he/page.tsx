import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ContactsManager } from '../../../components/admin/contacts/ContactsManager';

export const metadata: Metadata = { title: 'Tin nhắn liên hệ' };

// useSearchParams needs a Suspense boundary for the static shell (Next 16).
export default function AdminContactsPage() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Đang tải tin nhắn" className="h-60 animate-pulse rounded-card bg-surface" />}>
      <ContactsManager />
    </Suspense>
  );
}
