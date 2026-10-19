// Spam trap: real visitors never see or reach this field (off-screen, not focusable, hidden from
// screen readers) but form-filling bots do. Not display:none — some bots skip hidden fields.
// The backend silently drops any submission where it is filled.
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label htmlFor="website_url">Website</label>
      <input id="website_url" name="website_url" type="text" tabIndex={-1} autoComplete="off" />
    </div>
  );
}
