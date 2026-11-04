import { describe, expect, it } from 'vitest';
import { fieldErrors, safeNext, validateLogin, validateForgotPassword, validateRegister, validateResetPassword } from '../lib/forms';

describe('safeNext', () => {
  it('keeps a same-site path', () => {
    expect(safeNext('/gio-hang')).toBe('/gio-hang');
    expect(safeNext('/san-pham/pate?x=1')).toBe('/san-pham/pate?x=1');
  });

  it('refuses anything that could leave the site (open redirect)', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '', null, undefined]) {
      expect(safeNext(bad)).toBe('/');
    }
  });
});

describe('fieldErrors', () => {
  it('maps express-validator details to the first message per field', () => {
    expect(fieldErrors([
      { path: 'password', msg: 'Mật khẩu phải ít nhất 8 ký tự' },
      { path: 'password', msg: 'Mật khẩu phải chứa ít nhất một chữ hoa' },
      { path: 'email', msg: 'Email không hợp lệ' },
    ])).toEqual({ password: 'Mật khẩu phải ít nhất 8 ký tự', email: 'Email không hợp lệ' });
  });

  it('ignores details it does not understand', () => {
    expect(fieldErrors(null)).toEqual({});
    expect(fieldErrors('oops')).toEqual({});
    expect(fieldErrors([{ foo: 1 }])).toEqual({});
  });
});

describe('validateLogin', () => {
  it('requires a plausible email and a password', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({ email: 'Nhập email', password: 'Nhập mật khẩu' });
    expect(validateLogin({ email: 'abc', password: 'x' })).toEqual({ email: 'Email không hợp lệ' });
    expect(validateLogin({ email: 'a@b.vn', password: 'x' })).toEqual({});
  });
});

describe('validateRegister', () => {
  const ok = { email: 'a@b.vn', fullName: 'An', password: 'Abcdef1!', confirmPassword: 'Abcdef1!' };

  it('accepts what the backend accepts', () => {
    expect(validateRegister(ok)).toEqual({});
  });

  it('applies the backend password rules', () => {
    expect(validateRegister({ ...ok, password: 'Ab1!', confirmPassword: 'Ab1!' }).password).toMatch(/8 ký tự/);
    expect(validateRegister({ ...ok, password: 'abcdef1!', confirmPassword: 'abcdef1!' }).password).toMatch(/chữ hoa/);
    expect(validateRegister({ ...ok, password: 'ABCDEF1!', confirmPassword: 'ABCDEF1!' }).password).toMatch(/chữ thường/);
    expect(validateRegister({ ...ok, password: 'Abcdefg!', confirmPassword: 'Abcdefg!' }).password).toMatch(/chữ số/);
    expect(validateRegister({ ...ok, password: 'Abcdefg1', confirmPassword: 'Abcdefg1' }).password).toMatch(/ký tự đặc biệt/);
  });

  it('checks the confirmation', () => {
    expect(validateRegister({ ...ok, confirmPassword: 'other' }).confirmPassword).toMatch(/không khớp/);
  });
});

// /dat-lai-mat-khau: same password rules as registration (backend routes/auth.route.ts). The field
// is named newPassword like the backend body, so a 422 from the server lands on the same field.
describe('validateResetPassword', () => {
  it('accepts a strong password typed twice', () => {
    expect(validateResetPassword({ newPassword: 'NewPass#456', confirmPassword: 'NewPass#456' })).toEqual({});
  });

  it('asks for a password', () => {
    expect(validateResetPassword({ newPassword: '', confirmPassword: '' }).newPassword).toBeDefined();
  });

  it('refuses a weak password with the registration message', () => {
    expect(validateResetPassword({ newPassword: 'abcdefgh', confirmPassword: 'abcdefgh' }).newPassword).toBe('Mật khẩu phải chứa ít nhất một chữ hoa');
  });

  it('wants the confirmation to match', () => {
    expect(validateResetPassword({ newPassword: 'NewPass#456', confirmPassword: 'NewPass#457' })).toEqual({ confirmPassword: 'Xác nhận mật khẩu không khớp' });
  });
});

describe('validateForgotPassword', () => {
  it('needs a well-formed email, nothing else', () => {
    expect(validateForgotPassword({ email: 'an@example.com' })).toEqual({});
    expect(validateForgotPassword({ email: '' }).email).toBeDefined();
    expect(validateForgotPassword({ email: 'an@' }).email).toBeDefined();
  });
});
