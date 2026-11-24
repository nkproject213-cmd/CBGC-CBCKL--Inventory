import { isPhotoUrl } from "./flexible-fields";

export const SHARED_PHOTO_PREFIX = "inventory/shared/";
export const MAX_BULK_PHOTO_ITEMS = 2000;

/** Shared files outlive any one item, including after replacement or deletion. */
export function isSharedPhotoUrl(value: string | null | undefined): boolean {
  if (!isPhotoUrl(value)) return false;
  const url = new URL(value);
  let pathname: string;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { return false; }
  return !url.port
    && /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(url.hostname)
    && pathname.startsWith(`/${SHARED_PHOTO_PREFIX}`)
    && pathname.length > SHARED_PHOTO_PREFIX.length + 1;
}
