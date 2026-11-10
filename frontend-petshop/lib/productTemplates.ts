// Description outlines for the product form (test/productTemplates.test.ts). H2 sections, so the
// page reads answer-first and every part is visible (no tabs hiding content, .claude/rules/seo.md).
// Lines to fill in start with ✎; the form refuses to save while one is left, so a hint can never be
// published as if it were product information. No tables: the rich editor cannot hold them.
export const TEMPLATE_HINT = '✎';

export type DescriptionTemplate = { key: string; label: string; markdown: string };

export const DESCRIPTION_TEMPLATES: DescriptionTemplate[] = [
  {
    key: 'food',
    label: 'Khung: Thức ăn',
    markdown: [
      '## Phù hợp cho',
      '',
      `${TEMPLATE_HINT} Loài, độ tuổi, cân nặng (vd: mèo từ 3 tháng tuổi).`,
      '',
      '## Lợi ích',
      '',
      `- ${TEMPLATE_HINT} Lợi ích chính theo thông tin của nhà sản xuất.`,
      `- ${TEMPLATE_HINT} Lợi ích thứ hai.`,
      '',
      '## Thành phần',
      '',
      `${TEMPLATE_HINT} Chép từ bao bì: thành phần chính và tỉ lệ đạm / béo / xơ / độ ẩm (%).`,
      '',
      '## Hướng dẫn cho ăn',
      '',
      `- ${TEMPLATE_HINT} Lượng mỗi ngày theo cân nặng, theo bảng trên bao bì (vd: 2–4 kg: 40–60 g).`,
      `- ${TEMPLATE_HINT} Chia 2–3 bữa, luôn có nước sạch. Đổi thức ăn từ từ trong 7 ngày.`,
      '',
      '## Bảo quản',
      '',
      `${TEMPLATE_HINT} Nơi khô ráo, thoáng mát; đóng kín miệng túi sau khi mở.`,
      '',
    ].join('\n'),
  },
  {
    key: 'accessory',
    label: 'Khung: Phụ kiện',
    markdown: [
      '## Phù hợp cho',
      '',
      `${TEMPLATE_HINT} Loài, kích cỡ (vd: chó dưới 10 kg).`,
      '',
      '## Đặc điểm',
      '',
      `- ${TEMPLATE_HINT} Điểm nổi bật thứ nhất.`,
      `- ${TEMPLATE_HINT} Điểm nổi bật thứ hai.`,
      '',
      '## Chất liệu & kích thước',
      '',
      `- ${TEMPLATE_HINT} Chất liệu:`,
      `- ${TEMPLATE_HINT} Kích thước / trọng lượng:`,
      '',
      '## Cách dùng & vệ sinh',
      '',
      `${TEMPLATE_HINT} Cách dùng, cách giặt / lau, lưu ý an toàn.`,
      '',
    ].join('\n'),
  },
];

// An empty description gets the outline; existing text keeps its place and the outline goes below.
export function applyTemplate(current: string, template: string): string {
  return current.trim() ? `${current.trimEnd()}\n\n${template}` : template;
}

export const hasTemplateHints = (text: string): boolean => text.includes(TEMPLATE_HINT);
