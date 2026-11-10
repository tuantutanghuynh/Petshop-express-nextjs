import { describe, expect, it } from 'vitest';
import {
  campaignBody, campaignState, campaignToForm, campaignsAdminHref, campaignsApiPath, emptyCampaign, isEditable,
  normalizeCampaignErrors, parseCampaignsQuery, scheduleBody, validateCampaignForm, validateSendAt,
} from '../lib/adminNewsletter';
import type { Campaign } from '../lib/types';

const campaign: Campaign = {
  id: 'c1', subject: 'Mẹo tháng 11', status: 'SCHEDULED', isAdvertising: true, scheduledAt: '2026-11-10T01:30:00.000Z',
  startedAt: null, finishedAt: null, recipientCount: 0, sentCount: 0, failedCount: 0, unsubscribeCount: 0,
  createdAt: '2026-11-09T00:00:00.000Z', updatedAt: '2026-11-09T00:00:00.000Z', preheader: null, content: '## Chào',
  featured: [{ type: 'post', id: 'p1' }],
  featuredItems: [{ type: 'post', id: 'p1', title: 'Tẩy giun', available: false }],
};
const NOW = new Date('2026-11-10T00:00:00.000Z');

describe('campaign form', () => {
  it('starts empty, advertising on, sending now', () => {
    expect(emptyCampaign()).toEqual({ subject: '', preheader: '', content: '', isAdvertising: true, featured: [], sendAt: '' });
  });

  it('loads a campaign, its send time in Vietnam time and the featured names', () => {
    expect(campaignToForm(campaign)).toEqual({
      subject: 'Mẹo tháng 11', preheader: '', content: '## Chào', isAdvertising: true, sendAt: '2026-11-10T08:30',
      featured: [{ type: 'post', id: 'p1', title: 'Tẩy giun', available: false }],
    });
    expect(campaignToForm({ ...campaign, status: 'DRAFT', scheduledAt: null }).sendAt).toBe('');
  });

  it('sends trimmed text, null for an empty preheader, and only type + id of featured items', () => {
    expect(campaignBody({ ...campaignToForm(campaign), subject: '  Mẹo  ', preheader: '   ' })).toEqual({
      subject: 'Mẹo', preheader: null, content: '## Chào', isAdvertising: true, featured: [{ type: 'post', id: 'p1' }],
    });
  });

  it.each([
    [{ subject: ' ' }, 'subject', 'Nhập tiêu đề email'],
    [{ subject: 'x'.repeat(151) }, 'subject', 'Tối đa 150 ký tự'],
    [{ preheader: 'x'.repeat(151) }, 'preheader', 'Tối đa 150 ký tự'],
    [{ content: '  ' }, 'content', 'Nhập nội dung'],
    [{ content: 'x'.repeat(20_001) }, 'content', 'Tối đa 20.000 ký tự'],
  ])('refuses %j', (patch, field, message) => {
    expect(validateCampaignForm({ ...emptyCampaign(), subject: 'S', content: 'C', ...patch })[field]).toBe(message);
  });

  it('accepts a valid form', () => {
    expect(validateCampaignForm({ ...emptyCampaign(), subject: 'S', content: 'C' })).toEqual({});
  });
});

describe('send time', () => {
  it('is optional (send now) and read in Vietnam time', () => {
    expect(validateSendAt('', NOW)).toBeNull();
    expect(scheduleBody('')).toEqual({});
    expect(scheduleBody('2026-11-10T08:30')).toEqual({ scheduledAt: '2026-11-10T01:30:00.000Z' });
  });
  it.each([
    ['2026-02-30T10:00', 'Ngày giờ không hợp lệ'],
    ['2026-11-10T06:00', 'Giờ gửi đã qua'], // 23:00 UTC the day before
    ['2027-03-01T08:00', 'Chỉ hẹn trong vòng 90 ngày'],
  ])('refuses %s', (local, message) => {
    expect(validateSendAt(local, NOW)).toBe(message);
  });
  it('accepts a time later today', () => {
    expect(validateSendAt('2026-11-10T09:00', NOW)).toBeNull();
  });
});

describe('state', () => {
  it('only drafts and scheduled campaigns can be edited', () => {
    expect((['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED'] as const).map(isEditable)).toEqual([true, true, false, false, false]);
  });
  it('describes each status with a label and the time that matters', () => {
    expect(campaignState({ ...campaign, status: 'DRAFT', scheduledAt: null })).toEqual({ label: 'Nháp', when: 'Tạo 07:00 09/11/2026' });
    expect(campaignState(campaign)).toEqual({ label: 'Đã hẹn', when: 'Gửi lúc 08:30 10/11/2026' });
    expect(campaignState({ ...campaign, status: 'SENDING', startedAt: '2026-11-10T01:30:00.000Z' })).toEqual({ label: 'Đang gửi', when: 'Bắt đầu 08:30 10/11/2026' });
    expect(campaignState({ ...campaign, status: 'SENT', finishedAt: '2026-11-10T02:00:00.000Z' })).toEqual({ label: 'Đã gửi', when: 'Xong 09:00 10/11/2026' });
    expect(campaignState({ ...campaign, status: 'CANCELLED', finishedAt: '2026-11-10T02:00:00.000Z' })).toEqual({ label: 'Đã dừng', when: 'Dừng 09:00 10/11/2026' });
  });
});

describe('server errors', () => {
  it('puts every featured[…] error on the picker', () => {
    expect(normalizeCampaignErrors({ 'featured[0].type': 'Loại không hợp lệ', subject: 'x' })).toEqual({ featured: 'Loại không hợp lệ', subject: 'x' });
  });
});

describe('list URL state', () => {
  it('reads tab and page from the URL, ignoring junk', () => {
    expect(parseCampaignsQuery(new URLSearchParams('tab=SENT&page=3'))).toEqual({ tab: 'SENT', page: 3 });
    expect(parseCampaignsQuery(new URLSearchParams('tab=hack&page=-1'))).toEqual({ tab: 'all', page: 1 });
  });
  it('writes the admin URL and the API path', () => {
    expect(campaignsAdminHref({ tab: 'all', page: 1 })).toBe('/admin/ban-tin');
    expect(campaignsAdminHref({ tab: 'DRAFT', page: 2 })).toBe('/admin/ban-tin?tab=DRAFT&page=2');
    expect(campaignsApiPath({ tab: 'all', page: 1 })).toBe('/newsletter/campaigns?page=1&pageSize=20');
    expect(campaignsApiPath({ tab: 'SCHEDULED', page: 2 })).toBe('/newsletter/campaigns?page=2&pageSize=20&status=SCHEDULED');
  });
});
