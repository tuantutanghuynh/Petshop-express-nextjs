// Form helpers shared by the customer pages. Client-side checks mirror the backend rules
// (backend/routes/auth.route.ts) so most mistakes are shown before a round trip; the backend still
// validates everything, and its 422 details are mapped back onto the same fields.

export type FieldErrors = Record<string, string>;

// Where to go after login. Only a same-site path: "?next=https://evil.example" on a real login
// link would otherwise send the customer to a look-alike site right after they typed a password.
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  return raw;
}

// express-validator details ([{ path, msg }]) → first message per field.
export function fieldErrors(details: unknown): FieldErrors {
  if (!Array.isArray(details)) return {};
  const out: FieldErrors = {};
  for (const d of details) {
    if (typeof d !== 'object' || d === null) continue;
    const { path, msg } = d as { path?: unknown; msg?: unknown };
    if (typeof path === 'string' && typeof msg === 'string' && !(path in out)) out[path] = msg;
  }
  return out;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SPECIAL = /[!@#$%^&*(),.?":{}|<>]/; // same set as the backend rule

function emailError(email: string): string | undefined {
  if (!email.trim()) return 'Nhập email';
  if (!EMAIL.test(email.trim())) return 'Email không hợp lệ';
  return undefined;
}

export function validateLogin(v: { email: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};
  const email = emailError(v.email);
  if (email) errors.email = email;
  if (!v.password) errors.password = 'Nhập mật khẩu';
  return errors;
}

function passwordError(p: string): string | undefined {
  if (p.length < 8) return 'Mật khẩu phải ít nhất 8 ký tự';
  if (!/[A-Z]/.test(p)) return 'Mật khẩu phải chứa ít nhất một chữ hoa';
  if (!/[a-z]/.test(p)) return 'Mật khẩu phải chứa ít nhất một chữ thường';
  if (!/[0-9]/.test(p)) return 'Mật khẩu phải chứa ít nhất một chữ số';
  if (!SPECIAL.test(p)) return 'Mật khẩu phải chứa ít nhất một ký tự đặc biệt';
  return undefined;
}

export function validateRegister(v: { email: string; fullName: string; password: string; confirmPassword: string }): FieldErrors {
  const errors: FieldErrors = {};
  const email = emailError(v.email);
  if (email) errors.email = email;
  if (!v.fullName.trim()) errors.fullName = 'Nhập họ tên';
  const password = passwordError(v.password);
  if (password) errors.password = password;
  if (v.confirmPassword !== v.password) errors.confirmPassword = 'Xác nhận mật khẩu không khớp';
  return errors;
}

// After a failed submit, move focus to the first field (in form order) that has an error: on a
// phone it is often off screen, and focus scrolls it into view and opens the keyboard on it. Error
// keys may be backend paths ("shippingAddress.phone"); the input is matched by its last segment.
export function focusFirstError(form: HTMLFormElement, errors: FieldErrors): void {
  const names = new Set(Object.keys(errors).map((key) => key.split('.').pop()));
  for (const el of Array.from(form.elements)) {
    const name = el.getAttribute('name');
    if (name && names.has(name) && el instanceof HTMLElement) {
      el.focus();
      return;
    }
  }
}
