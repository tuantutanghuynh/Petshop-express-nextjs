'use client';

import { CAMPAIGN_LIMITS, type CampaignFormValues } from '../../../lib/adminNewsletter';
import type { FieldErrors } from '../../../lib/forms';
import { TextField } from '../../ui/TextField';
import { MarkdownField } from '../products/MarkdownField';
import { FeaturedPicker } from './FeaturedPicker';

type Props = {
  values: CampaignFormValues;
  errors: FieldErrors;
  onChange: (patch: Partial<CampaignFormValues>) => void;
  onUploading: (busy: boolean) => void;
};

const count = (v: string, max: number) => `${v.trim().length}/${max}`;

// The fields of a campaign, in the order the reader meets them: subject and preview line in the
// inbox, then the email itself, then when it goes. State and actions live in CampaignForm.
export function CampaignFields({ values, errors, onChange, onUploading }: Props) {
  return (
    <>
      <TextField name="subject" label="Tiêu đề email *" value={values.subject} error={errors.subject} maxLength={CAMPAIGN_LIMITS.subject}
        hint={`Ngắn, nói rõ lợi ích (vd "Lịch tẩy giun cho mèo theo tuổi"). ${count(values.subject, CAMPAIGN_LIMITS.subject)}`}
        onChange={(e) => onChange({ subject: e.target.value })} />
      <TextField name="preheader" label="Dòng xem trước" value={values.preheader} error={errors.preheader} maxLength={CAMPAIGN_LIMITS.preheader}
        hint={`Hiện cạnh tiêu đề trong hộp thư. ${count(values.preheader, CAMPAIGN_LIMITS.preheader)}`}
        onChange={(e) => onChange({ preheader: e.target.value })} />
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-ink">
        <input type="checkbox" name="isAdvertising" checked={values.isAdvertising} onChange={(e) => onChange({ isAdvertising: e.target.checked })} className="mt-0.5 size-5 shrink-0" />
        <span><b>Email quảng cáo</b>: thêm nhãn <b>[QC]</b> trước tiêu đề (Nghị định 91/2020 về thư quảng cáo). Bỏ chọn khi email chỉ có kiến thức, không chào bán.</span>
      </label>
      <MarkdownField name="content" label="Nội dung *" value={values.content} error={errors.content} rows={14} onUploading={onUploading}
        hint="Viết như một bài ngắn: lời chào, 2–3 ý chính, lời kêu gọi. Chân email (địa chỉ shop, link huỷ) tự thêm."
        onChange={(content) => onChange({ content })} />
      <FeaturedPicker value={values.featured} error={errors.featured} onChange={(featured) => onChange({ featured })} />
      <TextField name="sendAt" type="datetime-local" label="Giờ gửi (giờ Việt Nam)" value={values.sendAt} error={errors.sendAt}
        hint="Để trống là gửi ngay khi bấm nút. Gửi dần theo giới hạn mỗi ngày của Brevo (gói miễn phí 300 thư/ngày)."
        onChange={(e) => onChange({ sendAt: e.target.value })} />
    </>
  );
}
