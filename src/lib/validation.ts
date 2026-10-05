/**
 * Form validation. The rules match the backend and HueVistaFrontEnd/src/lib/validation.ts.
 * Each `validate*` returns an i18n key for the error, or null when the value is valid.
 */
import type { MessageKey } from "@/i18n";

/** Only the digits a person typed, without +91 / 0 prefixes. */
export function mobileDigits(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

/** An Indian mobile: ten digits starting 6–9. */
export function isIndianMobile(value: string): boolean {
  return /^[6-9]\d{9}$/.test(mobileDigits(value));
}

/** "+919876543210" — the form the backend normalises every number to. */
export function toE164India(value: string): string {
  return `+91${mobileDigits(value)}`;
}

/** "98765 43210" while typing — grouped 5-5 the way numbers are read aloud. */
export function formatMobileForDisplay(value: string): string {
  const d = mobileDigits(value).slice(0, 10);
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
}

export function validateMobile(value: string): MessageKey | null {
  return isIndianMobile(value) ? null : "validation.mobile";
}

/** Longest name the app accepts — the backend's limit for a name given with a mobile sign-up. */
export const NAME_MAX = 80;

/** A name: the backend wants at least two characters (PATCH /api/auth/profile). */
export function validateName(value: string): MessageKey | null {
  const name = value.trim();
  if (!name) return "validation.nameRequired";
  if (name.length < 2) return "validation.nameShort";
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): MessageKey | null {
  return EMAIL_RE.test(value.trim()) ? null : "validation.email";
}

/** Backend rule for every new password: eight characters, a letter and a number. */
export function validateNewPassword(value: string): MessageKey | null {
  if (value.length < 8) return "validation.passwordLength";
  if (!/\p{L}/u.test(value) || !/\d/.test(value)) return "validation.passwordMix";
  return null;
}

/** A shop's access code: exactly 8 letters and numbers (e.g. 7K2NQ9PX). */
export function normalizeShopCode(value: string): string {
  return value.trim().toUpperCase();
}

export function validateShopCode(value: string): MessageKey | null {
  return /^[A-Z0-9]{8}$/.test(normalizeShopCode(value)) ? null : "validation.shopCode";
}
