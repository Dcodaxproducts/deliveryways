import { createHash } from 'node:crypto';

const getFaviconValue = (branding: unknown): unknown => {
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

  return assetRecord.faviconUrl ?? nestedFavicon ?? null;
};

export const createBrandingVersion = (
  restaurantId: string,
  branding: unknown,
): string =>
  createHash('sha256')
    .update(JSON.stringify([restaurantId, getFaviconValue(branding)]))
    .digest('hex')
    .slice(0, 16);
