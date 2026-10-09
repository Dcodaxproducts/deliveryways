# Image upload and display contract

## Authoritative ingestion

All JPEG, PNG, and WebP uploads use `POST /api/v1/storage/upload-image` as multipart form data (field `file`, optional `assetType`: `hero`, `card`, `thumb`, or `logo`). The server validates magic bytes, rejects MIME spoofing, SVG, GIF/animation, corruption, images above 20 MB or 40 megapixels, auto-orients, strips metadata, bounds dimensions without upscaling, and stores WebP at quality 82. The legacy presigned route remains available for PDF only.

Output object keys retain the existing tenant/restaurant/branch/user scope and use UUID collision protection. Objects are stored with `image/webp`, one-year immutable cache control, and width/height/source-byte metadata. Processing is limited to two concurrent libvips jobs and ten seconds per operation. No temporary files are used.

The current storage schema supports one canonical optimized object, not responsive variants. Hero/card/thumb variants would require URL-set fields and client `srcset` support; this change deliberately does not invent that contract.

## Display contract

The customer home hero source is `data.restaurant.coverImage` (with client compatibility fallbacks to `coverImageUrl` / `heroImageUrl`). Branch-specific restaurant pages prefer `branch.coverImage`; storefront logo prefers branch logo, then restaurant logo. Customer category and menu cards consume their existing `imageUrl` fields. Backend customer-app responses resolve those stored object URLs through `StorageService.resolveViewUrl`; no new response fields are required.

## Replacement and rollout

`replaceFileUrl` may be supplied by authenticated callers. The service verifies object scope, uploads the new object, then deletes the old one; if validation or old-object deletion fails, the new object is removed. Existing clients continue their current explicit entity-save sequence and should invoke the existing delete endpoint if a later entity save fails.

Deploy backend and all upload clients together because image use of `presigned-upload` is intentionally rejected after this change. Existing stored images remain readable and are not rewritten.

## Optional backfill (do not run automatically)

1. Inventory DB media columns and deduplicate URLs.
2. For each owned S3 object, stream through the same `ImageProcessorService` with bounded concurrency.
3. Write a new UUID-keyed WebP, verify dimensions/type/hash, update the owning record transactionally, then delete the old object only after commit.
4. Persist checkpoints and a source-to-target manifest; dry-run first and retain rollback data.
5. Skip external URLs, missing objects, animations, SVG, and already compliant WebP objects; report them for manual review.
