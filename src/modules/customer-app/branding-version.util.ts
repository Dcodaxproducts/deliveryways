import { createHash } from 'node:crypto';

export const getBrandingFaviconUrl = (branding: unknown): string | null => {
  if (!branding || typeof branding !== 'object' || Array.isArray(branding)) {
    return null;
  }

  const assets = (branding as Record<string, unknown>).assets;
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) {
    return null;
  }

  const assetRecord = assets as Record<string, unknown>;
  const logos = assetRecord.logos;
  const nestedFavicon =
    logos && typeof logos === 'object' && !Array.isArray(logos)
      ? (logos as Record<string, unknown>).faviconUrl
      : null;

  const directFavicon = assetRecord.faviconUrl;
  if (typeof directFavicon === 'string' && directFavicon.trim()) {
    return directFavicon.trim();
  }

  return typeof nestedFavicon === 'string' && nestedFavicon.trim()
    ? nestedFavicon.trim()
    : null;
};

export const createBrandingVersion = (
  restaurantId: string,
  branding: unknown,
  updatedAt?: Date | string | null,
): string =>
  createHash('sha256')
    .update(
      JSON.stringify([
        restaurantId,
        getBrandingFaviconUrl(branding),
        updatedAt instanceof Date
          ? updatedAt.toISOString()
          : (updatedAt ?? null),
      ]),
    )
    .digest('hex')
    .slice(0, 16);
