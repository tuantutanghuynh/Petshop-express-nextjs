# Rich text editor for posts and product descriptions — design (2026-11-10)

## Goal
Replace the raw Markdown textarea in the admin (post content, product description) with a
Word-like editor: toolbar for headings, bold, italic, strike, lists, quote, link, image, undo/redo.

## Decisions
- Library: Tiptap, pinned to 3.32.0 (@tiptap/react, @tiptap/pm, @tiptap/starter-kit,
  @tiptap/extension-image, @tiptap/markdown). 3.33.0 was 5 days old; 3.32.0 is 4 weeks old.
- Storage stays Markdown: no DB, API or public-page change. Old content opens formatted.
- `MarkdownField` keeps its props (`value` markdown, `onChange`, `name`, `label`, `hint`, `error`);
  callers stay unchanged. Modes: "Soạn" (rich, default) and "Markdown" (raw textarea). Preview removed.
- Editor is client-only, loaded with `next/dynamic({ ssr: false })` from the admin field only.
- Headings: H2 and H3 only (the page title is the single H1; H2s feed the post's table of contents).
- Image: upload through POST /uploads/image, alt text required, then inserted as `![alt](url)`.
- Link: small inline form (no window.prompt); accepts http(s), mailto, tel only.
- Toolbar buttons ≥ 44px, sticky at the top of the editor, wraps on narrow screens.

## Out of scope
Tables, text colour, alignment, font size (Markdown cannot store them). Tables still work in the
Markdown mode.

## Testing
- Unit (Vitest, jsdom): markdown → editor → markdown keeps headings, emphasis, lists, quote, link,
  image; link URL check refuses javascript: and data:.
- Browser: write and save a post, edit a product description, no overflow at 320/390/768/1024px.
- ADR-024 for the new dependency.
