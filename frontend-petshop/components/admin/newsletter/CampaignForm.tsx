'use client';

import { useState, type FormEvent } from 'react';
import { authFetch } from '../../../lib/adminAuth';
import {
  campaignBody, campaignState, campaignToForm, emptyCampaign, normalizeCampaignErrors, scheduleBody,
  validateCampaignForm, validateSendAt, type CampaignFormValues,
} from '../../../lib/adminNewsletter';
import { fieldErrors, focusFirstError, type FieldErrors } from '../../../lib/forms';
import type { ApiEnvelope, Campaign } from '../../../lib/types';
import { formatVietnamDateTime } from '../../../lib/vnTime';
import { FormAlert } from '../../ui/FormAlert';
import { CampaignFields } from './CampaignFields';

type Action = 'save' | 'test' | 'schedule' | 'cancel';
type Props = { initial: Campaign | null; recipients: number | null; onChanged: (c: Campaign) => void };

const INVALID = 'Có ô chưa hợp lệ, xem các dòng báo đỏ.';
const BUTTON = 'min-h-12 w-full rounded-full px-6 font-bold disabled:opacity-60 md:w-auto';

// Write or edit one campaign (spec 2026-11-10). Every action saves first, so "Gửi thử" and "Hẹn
// giờ" always use what is on screen. A new campaign gets its URL after the first save without
// leaving the page (history.replaceState keeps the App Router in step).
export function CampaignForm({ initial, recipients, onChanged }: Props) {
  const [campaign, setCampaign] = useState<Campaign | null>(initial);
  const [values, setValues] = useState<CampaignFormValues>(initial ? campaignToForm(initial) : emptyCampaign());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [uploading, setUploading] = useState(false);
  const set = (patch: Partial<CampaignFormValues>) => setValues((v) => ({ ...v, ...patch }));

  function fail(form: HTMLFormElement, res: ApiEnvelope<unknown>, fallback: string) {
    const server = normalizeCampaignErrors(fieldErrors(res.error?.details));
    setErrors(server);
    setAlert(Object.keys(server).length > 0 ? INVALID : res.error?.message || fallback);
    requestAnimationFrame(() => focusFirstError(form, server));
  }

  function adopt(next: Campaign) {
    if (!campaign) window.history.replaceState(null, '', `/admin/ban-tin/${next.id}`);
    setCampaign(next);
    onChanged(next);
  }

  async function save(form: HTMLFormElement): Promise<Campaign | null> {
    const res = await authFetch<Campaign>(campaign ? `/newsletter/campaigns/${campaign.id}` : '/newsletter/campaigns', {
      method: campaign ? 'PATCH' : 'POST',
      body: JSON.stringify(campaignBody(values)),
    });
    if (res.error || !res.data) {
      fail(form, res, 'Chưa lưu được bản tin.');
      return null;
    }
    adopt(res.data);
    return res.data;
  }

  async function run(action: Action, form: HTMLFormElement) {
    setAlert(null);
    setNotice(null);
    const found = validateCampaignForm(values);
    const sendAtError = action === 'schedule' ? validateSendAt(values.sendAt) : null;
    if (sendAtError) found.sendAt = sendAtError;
    setErrors(found);
    if (action !== 'cancel' && Object.keys(found).length > 0) {
      setAlert(INVALID);
      return focusFirstError(form, found);
    }
    if (action === 'schedule') {
      const who = recipients === null ? 'tất cả người đã xác nhận đăng ký' : `${recipients} người đã xác nhận đăng ký`;
      const when = values.sendAt ? `lúc ${values.sendAt.replace('T', ' ')}` : 'ngay bây giờ';
      if (!window.confirm(`Gửi bản tin tới ${who}, ${when}?`)) return;
    }
    setBusy(action);
    try {
      if (action === 'cancel' && campaign) {
        const res = await authFetch<Campaign>(`/newsletter/campaigns/${campaign.id}/cancel`, { method: 'POST', body: '{}' });
        if (res.error || !res.data) fail(form, res, 'Chưa huỷ hẹn được.');
        else { adopt(res.data); setValues((v) => ({ ...v, sendAt: '' })); setNotice('Đã huỷ hẹn, bản tin quay về nháp.'); }
        return;
      }
      const saved = await save(form);
      if (!saved) return;
      if (action === 'save') return setNotice('Đã lưu.');
      if (action === 'test') {
        const res = await authFetch<{ to: string }>(`/newsletter/campaigns/${saved.id}/test`, { method: 'POST', body: '{}' });
        if (res.error || !res.data) fail(form, res, 'Chưa gửi thử được.');
        else setNotice(`Đã gửi thử tới ${res.data.to}. Kiểm tra hộp thư (cả mục Quảng cáo / Spam).`);
        return;
      }
      const res = await authFetch<Campaign>(`/newsletter/campaigns/${saved.id}/schedule`, { method: 'POST', body: JSON.stringify(scheduleBody(values.sendAt)) });
      if (res.error || !res.data) fail(form, res, 'Chưa hẹn giờ được.');
      else { adopt(res.data); setNotice(values.sendAt ? 'Đã hẹn giờ gửi.' : 'Đã xếp lịch gửi ngay, bắt đầu trong khoảng 1 phút.'); }
    } catch {
      setAlert('Chưa thực hiện được. Kiểm tra mạng rồi thử lại.');
    } finally {
      setBusy(null);
    }
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    void run((submitter?.value as Action | undefined) ?? 'save', e.currentTarget);
  };
  const scheduled = campaign?.status === 'SCHEDULED';
  const disabled = busy !== null || uploading;
  const label = (a: Action, idle: string, working: string) => (busy === a ? working : idle);

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-3xl flex-col gap-4">
      {scheduled && campaign && (
        <p role="status" className="rounded-card bg-yellow-hero/40 px-4 py-3 text-sm text-ink">
          <b>{campaignState(campaign).label}</b>: gửi lúc {campaign.scheduledAt ? formatVietnamDateTime(campaign.scheduledAt) : ''}. Sửa nội dung rồi bấm “Lưu thay đổi”; đổi giờ thì bấm “Hẹn lại giờ”.
        </p>
      )}
      <FormAlert message={alert} />
      {notice && <p role="status" className="rounded-card bg-mint px-4 py-3 text-sm font-bold text-brand-deep">{notice}</p>}
      <CampaignFields values={values} errors={errors} onChange={set} onUploading={setUploading} />
      {recipients !== null && <p className="text-sm text-muted">Hiện có <b className="text-ink">{recipients}</b> người đã xác nhận đăng ký.</p>}
      {/* "Lưu" comes first in the DOM: Enter in a field submits with the first submit button, and
          that must never be the one that emails every subscriber. `order` keeps the visual order. */}
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
        <button type="submit" value="save" disabled={disabled} className={`${BUTTON} order-3 border border-line text-ink`}>{label('save', scheduled ? 'Lưu thay đổi' : 'Lưu nháp', 'Đang lưu…')}</button>
        <button type="submit" value="schedule" disabled={disabled} className={`${BUTTON} order-1 bg-brand-ink text-white`}>
          {label('schedule', scheduled ? 'Hẹn lại giờ' : values.sendAt ? 'Hẹn giờ gửi' : 'Gửi ngay', 'Đang xếp lịch…')}
        </button>
        <button type="submit" value="test" disabled={disabled} className={`${BUTTON} order-2 border border-brand-ink text-brand-ink`}>{label('test', 'Gửi thử cho tôi', 'Đang gửi thử…')}</button>
        {scheduled && (
          <button type="submit" value="cancel" formNoValidate disabled={disabled} className={`${BUTTON} order-4 border border-pink-ink text-pink-ink`}>{label('cancel', 'Huỷ hẹn', 'Đang huỷ…')}</button>
        )}
      </div>
    </form>
  );
}
