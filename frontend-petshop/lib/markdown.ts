import { marked } from 'marked';
import { sanitizeHtml } from './sanitize';

export { excerptFromContent } from './excerpt';

export function renderMarkdown(content: string | null | undefined): string {
  // `async: false` makes marked return a string instead of string | Promise<string>.
  const rawHtml = marked.parse(content || '', { async: false });
  return sanitizeHtml(rawHtml);
}
