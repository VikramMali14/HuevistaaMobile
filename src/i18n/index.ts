import { en } from "./en";
import { hi } from "./hi";
import type { Language } from "./types";

export type { Language, Messages, Translation } from "./types";

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every valid string key, e.g. "errors.network". A typo is a type error. */
export type MessageKey = Leaves<typeof en>;

type Vars = Record<string, string | number>;

const tables: Record<Language, unknown> = { en, hi };

let current: Language = "en";
const listeners = new Set<() => void>();

/** The language strings are read in now. */
export function getLanguage(): Language {
  return current;
}

/** Reads every string in `next` from now on, and tells whoever is listening. */
export function setLanguage(next: Language): void {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function lookup(table: unknown, key: string): string | undefined {
  let node: unknown = table;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" && node.trim() ? node : undefined;
}

function fill(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/**
 * The string for `key` in the current language — English for any key the translation
 * lacks — with `{name}` placeholders filled from `vars`.
 *
 *   t("planned.eyebrow", { id: "C11", phase: 3 })  →  "C11 · Phase 3"
 */
export function t(key: MessageKey, vars?: Vars): string {
  const template = (current === "en" ? undefined : lookup(tables[current], key)) ?? lookup(en, key) ?? key;
  return fill(template, vars);
}

/** The English string, whatever the language: for what is printed (the board's PDF font has Latin letters only). */
export function tEn(key: MessageKey, vars?: Vars): string {
  return fill(lookup(en, key) ?? key, vars);
}

/**
 * A count's string: `one` for a single thing, else `other`. In Hindi nought takes the
 * singular too ("0 कमरा"), as CLDR has it — worked out here rather than through
 * Intl.PluralRules, which Hermes doesn't carry on every build.
 */
export function plural(n: number, one: MessageKey, other: MessageKey, vars?: Vars): string {
  const single = current === "hi" ? n === 0 || n === 1 : n === 1;
  return t(single ? one : other, { n, ...vars });
}
