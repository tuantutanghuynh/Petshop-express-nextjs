import { describe, expect, it } from 'vitest';
import { focusFirstError } from '../lib/forms';

// On a phone the first wrong field is often off screen after submit: focusing it scrolls it into
// view and puts the keyboard on it. "First" means first in the form, not first in the error object.
function form(html: string): HTMLFormElement {
  document.body.innerHTML = `<form>${html}</form>`;
  return document.querySelector('form')!;
}

describe('focusFirstError', () => {
  it('focuses the first field in form order that has an error', () => {
    const f = form('<input name="email"><input name="password"><input name="confirmPassword">');
    focusFirstError(f, { confirmPassword: 'x', password: 'y' });
    expect(document.activeElement?.getAttribute('name')).toBe('password');
  });

  it('matches backend paths like "shippingAddress.phone" to the input named "phone"', () => {
    const f = form('<input name="fullName"><input name="phone">');
    focusFirstError(f, { 'shippingAddress.phone': 'x' });
    expect(document.activeElement?.getAttribute('name')).toBe('phone');
  });

  it('does nothing when there is no error', () => {
    const f = form('<input name="email">');
    (document.body as HTMLElement).focus();
    focusFirstError(f, {});
    expect(document.activeElement?.tagName).not.toBe('INPUT');
  });
});
