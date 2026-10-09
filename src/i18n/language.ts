import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { useSyncExternalStore } from "react";

import { getLanguage, setLanguage, subscribeLanguage, type Language } from "./index";

/**
 * Which language the app speaks: one chosen in S1, else the phone's. Kept on the phone
 * (not the account), so it survives signing out — it's the person's, not the account's.
 */
const STORAGE_KEY = "hv.language";

/** What S1 offers: a language, or "the phone's" (the default). */
export type LanguageChoice = Language | "phone";

let choice: LanguageChoice = "phone";

const isLanguage = (value: unknown): value is Language => value === "en" || value === "hi";

/** Hindi when the phone's first language is Hindi; English for anything else. */
export function phoneLanguage(): Language {
  try {
    return getLocales()[0]?.languageCode === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
}

/** At start-up, before anything is drawn: the stored choice, else the phone's language. */
export async function loadLanguage(): Promise<void> {
  let stored: string | null = null;
  try {
    stored = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    // Unreadable storage: follow the phone.
  }
  choice = isLanguage(stored) ? stored : "phone";
  setLanguage(choice === "phone" ? phoneLanguage() : choice);
}

export function languageChoice(): LanguageChoice {
  return choice;
}

/** S1's choice: kept, then every string is read in it. */
export async function chooseLanguage(next: LanguageChoice): Promise<void> {
  choice = next;
  try {
    if (next === "phone") await AsyncStorage.removeItem(STORAGE_KEY);
    else await AsyncStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not kept: this run still switches; the next start follows the phone.
  }
  setLanguage(next === "phone" ? phoneLanguage() : next);
}

/** The language now, re-rendering when it changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
}
