import { en } from "./en";

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every valid string key, e.g. "errors.network". A typo is a type error. */
export type MessageKey = Leaves<typeof en>;

type Vars = Record<string, string | number>;

function lookup(key: string): string | undefined {
  let node: unknown = en;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * The string for `key`, with `{name}` placeholders filled from `vars`.
 *
 *   t("planned.eyebrow", { id: "C11", phase: 3 })  →  "C11 · Phase 3"
 */
export function t(key: MessageKey, vars?: Vars): string {
  const template = lookup(key) ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
