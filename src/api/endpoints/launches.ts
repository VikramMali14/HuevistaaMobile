/**
 * /api/launches — other makers' new products, the ones that are on right now, newest first.
 * Public. Backend: launch/controller/LaunchController. Web reference: HueVistaFrontEnd
 * lib/launches-server.ts. Screen: C1.
 */
import { env } from "@/config/env";

import { api } from "../instance";

export interface LaunchCard {
  slug: string;
  name: string;
  tagline: string;
  /** The maker's photograph, loadable as it stands (see `pictureUrl`). */
  packshot: string;
  packshotAlt?: string;
  company: { name: string };
}

/**
 * Where a launch's picture loads from: one uploaded in the admin console is an API path,
 * one that ships with the website a path on the site.
 */
export function pictureUrl(src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  return src.startsWith("/api/") ? `${env.apiOrigin}${src}` : `${env.siteOrigin}${src}`;
}

function isCard(row: unknown): row is LaunchCard {
  if (!row || typeof row !== "object") return false;
  const l = row as Partial<LaunchCard>;
  return (
    typeof l.slug === "string" &&
    typeof l.name === "string" &&
    typeof l.tagline === "string" &&
    typeof l.packshot === "string" &&
    typeof l.company?.name === "string"
  );
}

export const launchesApi = {
  /** One malformed row is left out rather than taking the list down with it. */
  list: async (): Promise<LaunchCard[]> => {
    const rows = await api.request<unknown>("api/launches");
    if (!Array.isArray(rows)) return [];
    return rows.filter(isCard).map((l) => ({ ...l, packshot: pictureUrl(l.packshot) }));
  },
};
