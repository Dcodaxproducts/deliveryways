# Image upload and display contract

## Authoritative ingestion

Updated clients use `POST /api/v1/storage/upload-image` as multipart form data (field `file`, optional `assetType`: `hero`, `card`, `thumb`, or `logo`). A successful response advertises `capability: optimized-image-v1`. The server validates magic bytes, rejects MIME spoofing, SVG, GIF/animation, corruption, images above 20 MB or 40 megapixels, auto-orients, strips metadata, bounds dimensions without upscaling, and stores WebP at quality 82. The route is limited to 10 requests per minute per throttler identity, two active libvips jobs, and 20 queued jobs. Queue and processing work have independent 10-second limits. No temporary files are used. HTTP disconnect does not currently propagate cancellation into libvips; bounded processing, queueing, and timeouts are the protection.

`POST /api/v1/storage/presigned-upload` remains canonical for PDFs. For rolling compatibility, legacy image presigning remains available only until **2027-01-31T00:00:00Z**. Legacy image responses include `deprecated`, `sunsetAt`, and `replacementEndpoint`; each issuance emits the structured `legacy_image_presigned_upload_issued` warning without object names or user IDs. This bridge cannot validate or optimize direct S3 bytes: it is explicitly temporary support for installed mobile and previously deployed web/admin clients, not equivalent enforcement.

Output object keys retain the existing tenant/restaurant/branch/user scope and use UUID collision protection. Objects are stored with `image/webp`, one-year immutable cache control, inline disposition, and width/height/source-byte metadata.

The current storage schema supports one canonical optimized object, not responsive variants. Hero/card/thumb variants would require URL-set fields and client `srcset` support; this change deliberately does not invent that contract.

## Display contract

The customer home hero source is `data.restaurant.coverImage` (with client compatibility fallbacks to `coverImageUrl` / `heroImageUrl`). Branch-specific restaurant pages prefer `branch.coverImage`; storefront logo prefers branch logo, then restaurant logo. Customer category and menu cards consume their existing `imageUrl` fields. Backend customer-app responses resolve those stored object URLs through `StorageService.resolveViewUrl`; no new response fields are required.

## Replacement and rollout

`replaceFileUrl` may be supplied by authenticated callers. The service verifies storage scope, uploads the new object, then deletes the old one; if old-object authorization or deletion fails, the new object is removed. This is a storage-level replacement helper, not an atomic entity-record update.

### Coordinated rollout

1. Deploy the cumulative backend first. Confirm `/storage/upload-image` health, S3 metadata/content type, throttling, and that legacy image presigning returns deprecation metadata rather than rejecting.
2. Deploy web/admin/landing clients, then release both Flutter clients. Updated clients must use `optimized-image-v1`; do not require installed mobile clients to update immediately.
3. Dashboard/count `legacy_image_presigned_upload_issued` by role/authentication class. Alert if usage is not declining. Logs deliberately exclude file names, URLs, and user identifiers.
4. Before the fixed sunset, prove supported web deployments and minimum supported mobile versions use optimized ingestion. Contact/force-update only according to product policy.
5. Remove the legacy image branch only after 14 consecutive days of zero legacy image issuances and confirmation that App Store/Play minimum supported versions are above the migration release. PDFs remain on presigning. The hard sunset prevents silent indefinite retention; changing it requires a reviewed code release and an updated removal record.

### Rollback

If optimized ingestion has elevated errors, roll clients back first; legacy clients continue through the bounded bridge until the sunset. If the backend must be rolled back, revert to the immediately preceding cumulative backend commit, not an older divergent branch. A backend rollback restores direct image presigning and therefore also restores its lack of server-side byte validation/optimization; keep it time-bounded and monitor object growth. Existing stored images remain readable and are not rewritten. No database migration is involved.

`replaceFileUrl` is intentionally optional. It is safe only when the caller has already made the new URL authoritative or can atomically roll the owning record back: storage cannot make an entity update and S3 deletion one transaction. Callers that upload before saving an entity must delete the newly uploaded object if save/cancel fails, and delete the prior owned object only after the entity update succeeds. A periodic manifest-based orphan inventory remains recommended.

## Optional backfill (do not run automatically)

1. Inventory DB media columns and deduplicate URLs.
2. For each owned S3 object, stream through the same `ImageProcessorService` with bounded concurrency.
3. Write a new UUID-keyed WebP, verify dimensions/type/hash, update the owning record transactionally, then delete the old object only after commit.
4. Persist checkpoints and a source-to-target manifest; dry-run first and retain rollback data.
5. Skip external URLs, missing objects, animations, SVG, and already compliant WebP objects; report them for manual review.
