import { describe, expect, it } from 'vitest';
import { validateProductForm, type ProductFormValues } from '../lib/adminProducts';
import { DESCRIPTION_TEMPLATES, TEMPLATE_HINT, applyTemplate, hasTemplateHints } from '../lib/productTemplates';
import { keepsMarkdown } from '../lib/richText';

// Ready-made description outlines in the product form: H2 sections (answer-first, no tabs), hint
// lines marked ✎ that must be replaced before saving, never overwriting text already written.

describe('description templates', () => {
  it('offers a food and an accessory outline', () => {
    expect(DESCRIPTION_TEMPLATES.map((t) => t.label)).toEqual(['Khung: Thức ăn', 'Khung: Phụ kiện']);
  });

  it.each(DESCRIPTION_TEMPLATES.map((t) => [t.label, t.markdown]))('%s uses H2 sections only, with hints, and opens in the rich editor', (_label, md) => {
    expect(md).toMatch(/^## /);
    expect(md).not.toMatch(/^# |^### |^\|/m); // no H1, no H3, no table (the editor cannot hold tables)
    expect(hasTemplateHints(md)).toBe(true);
    expect(keepsMarkdown(md)).toBe(true);
  });

  it('the food outline asks for feeding guidance and ingredients', () => {
    const food = DESCRIPTION_TEMPLATES[0].markdown;
    for (const h of ['## Phù hợp cho', '## Lợi ích', '## Thành phần', '## Hướng dẫn cho ăn', '## Bảo quản']) expect(food).toContain(h);
  });
});

describe('applyTemplate', () => {
  it('fills an empty description', () => {
    expect(applyTemplate('', '## A\n')).toBe('## A\n');
    expect(applyTemplate('  \n ', '## A\n')).toBe('## A\n');
  });
  it('adds below existing text, never replacing it', () => {
    expect(applyTemplate('Hạt cho mèo.\n\n', '## A\n')).toBe('Hạt cho mèo.\n\n## A\n');
  });
});

describe('hint lines', () => {
  it('are found anywhere in the text', () => {
    expect(hasTemplateHints(`Đoạn\n\n- ${TEMPLATE_HINT} Lợi ích`)).toBe(true);
    expect(hasTemplateHints('Đoạn đã viết xong')).toBe(false);
  });

  it('block saving the product until replaced', () => {
    const base: ProductFormValues = {
      name: 'Hạt cho mèo', slug: 'hat-cho-meo', brand: '', description: DESCRIPTION_TEMPLATES[0].markdown, status: 'draft', categoryId: 'c1', attributes: {},
      variants: [{ id: null, label: '1kg', sku: 'H-1', price: '120000', compareAtPrice: '', stock: '5', reserved: 0 }],
    };
    expect(validateProductForm(base, 'create').description).toBe(`Còn dòng gợi ý (${TEMPLATE_HINT}) chưa thay bằng nội dung thật`);
    expect(validateProductForm({ ...base, description: '## Lợi ích\n\n- Giàu đạm' }, 'create').description).toBeUndefined();
  });
});
