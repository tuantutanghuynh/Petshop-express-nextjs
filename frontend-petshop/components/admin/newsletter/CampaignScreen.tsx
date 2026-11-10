'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '../../../lib/adminAuth';
import { isEditable } from '../../../lib/adminNewsletter';
import type { Campaign, NewsletterSubscriber, PageMeta } from '../../../lib/types';
import { FormAlert } from '../../ui/FormAlert';
import { CampaignForm } from './CampaignForm';
import { CampaignReport } from './CampaignReport';

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; campaign: Campaign | null; recipients: number | null };

// How many people a campaign would reach now; null when the count could not be read (the form
// still works, it just says "tất cả").
async function confirmedCount(): Promise<number | null> {
  try {
    const res = await authFetch<NewsletterSubscriber[]>('/newsletter/subscribers?status=CONFIRMED&pageSize=1');
    return res.error ? null : ((res.meta as PageMeta | null)?.total ?? null);
  } catch {
    return null;
  }
}

async function load(id?: string): Promise<Load> {
  try {
    const [res, recipients] = await Promise.all([id ? authFetch<Campaign>(`/newsletter/campaigns/${id}`) : Promise.resolve(null), confirmedCount()]);
    if (res && (res.error || !res.data)) return { state: 'error' };
    return { state: 'ready', campaign: res?.data ?? null, recipients };
  } catch {
    return { state: 'error' };
  }
}

// /admin/ban-tin/moi and /admin/ban-tin/[id]: the editor while a campaign is a draft or scheduled,
// the report once it has started.
export function CampaignScreen({ id }: { id?: string }) {
  const [state, setState] = useState<Load>({ state: 'loading' });
  const refresh = useCallback(() => {
    load(id).then(setState);
  }, [id]);

  useEffect(() => {
    let active = true;
    load(id).then((next) => active && setState(next));
    return () => {
      active = false;
    };
  }, [id]);

  if (state.state === 'loading') return <div aria-busy="true" aria-label="Đang tải bản tin" className="h-96 max-w-3xl animate-pulse rounded-card bg-line" />;
  if (state.state === 'error') return <FormAlert message="Không tìm thấy bản tin này, hoặc chưa tải được. Tải lại trang để thử lại." />;

  const { campaign, recipients } = state;
  const changed = (c: Campaign) => setState({ state: 'ready', campaign: c, recipients });
  if (campaign && !isEditable(campaign.status)) return <CampaignReport campaign={campaign} onChanged={changed} onRefresh={refresh} />;
  // No key: the form keeps its own copy, so a first save (which gives the campaign its id) must not
  // remount it and lose the message it just showed.
  return <CampaignForm initial={campaign} recipients={recipients} onChanged={changed} />;
}
