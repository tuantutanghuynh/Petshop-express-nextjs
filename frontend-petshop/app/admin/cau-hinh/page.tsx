import type { Metadata } from 'next';
import { SettingsEditor } from '../../../components/admin/settings/SettingsEditor';

export const metadata: Metadata = { title: 'Cấu hình trang chủ' };

export default function AdminSettingsPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-extrabold">Cấu hình trang chủ &amp; thông tin shop</h1>
      <SettingsEditor />
    </>
  );
}
