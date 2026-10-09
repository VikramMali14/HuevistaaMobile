import type { en } from "./en";

/** The languages the app speaks. */
export type Language = "en" | "hi";

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** Every string table has English's keys, in any wording. */
export type Messages = Widen<typeof en>;

/**
 * A translation: every key English has, so a missing one is a type error — except what
 * stays English everywhere: what the board's PDF prints (its font has Latin letters only)
 * and the developer screens.
 */
export type Translation = Omit<Messages, "pdf" | "dev">;
