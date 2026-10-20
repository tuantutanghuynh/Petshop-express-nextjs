import type { Metadata } from 'next';
import { Dashboard } from '../../components/admin/dashboard/Dashboard';

export const metadata: Metadata = { title: 'Tổng quan' };

export default function AdminHomePage() {
  return <Dashboard />;
}
