# Rich text editor Implementation Plan

**Goal:** Word-like editor for post content and product description, still saving Markdown.
**Spec:** docs/superpowers/specs/2026-11-10-rich-text-editor-design.md

### Task 1: Dependencies
- `npm install --save-exact @tiptap/react@3.32.0 @tiptap/pm@3.32.0 @tiptap/starter-kit@3.32.0 @tiptap/extension-image@3.32.0 @tiptap/markdown@3.32.0` in frontend-petshop.

### Task 2: lib/richText.ts (TDD)
- `richTextExtensions()`: StarterKit (heading levels 2–3, link with openOnClick false, autolink, protocols http/https/mailto/tel), Image, Markdown.
- `safeLinkHref(raw): string | null` — trims, allows http(s)/mailto/tel, adds https:// to bare domains, refuses the rest.
- Test `test/richText.test.ts`: round trip of a sample markdown through a headless Editor; safeLinkHref cases.

### Task 3: components/admin/editor/{RichTextEditor,EditorToolbar,LinkForm,ImageForm}.tsx
- RichTextEditor: useEditor with `content: value, contentType: 'markdown'`, `immediatelyRender: false`, onUpdate → `editor.getMarkdown()`; syncs when `value` changes from outside.
- Toolbar with aria-pressed buttons; link and image forms inline.

### Task 4: MarkdownField
- Modes "Soạn" / "Markdown"; rich mode renders `dynamic(() => import('../editor/RichTextEditor'), { ssr: false })` with skeleton.

### Task 5: Verify
- typecheck, lint, tests, build; browser check on /admin/posts/moi and a product edit page at 320/390/768/1024.
- ADR-024 in docs/DECISIONS.md, PROGRESS entry, propose commit.
