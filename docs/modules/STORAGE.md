# Storage Module — DeliveryWays

## Purpose
Provides S3 presigned upload/view URLs so the frontend can upload images directly to AWS S3, optionally request a signed GET URL for private viewing, and delete stored files through the backend.

---

## Environment variables
Add these variables in `.env`:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_BUCKET_NAME`
- `AWS_PUBLIC_BASE_URL` (optional, for CloudFront/custom public asset base URL)
- `AWS_PRESIGNED_UPLOAD_EXPIRY_SECONDS` (optional, default `300`)

---

## API surface
Base path: `/api/v1/storage`

### Allowed folders
The storage API is now restricted to these known folders:

- `menu-items`
- `restaurant-logos`
- `branch-covers`
- `avatars`

Role access:
- `SUPER_ADMIN` → all folders
- `BUSINESS_ADMIN` → all folders
- `BRANCH_ADMIN` → `avatars`
- `CUSTOMER` → `avatars`

### Create presigned upload URL
`POST /storage/presigned-upload`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`
- `BRANCH_ADMIN`
- `CUSTOMER`

Body:
- `fileName` — original frontend file name
- `contentType` — image MIME type
- `folder` — required allowed bucket prefix

Example request:
```json
{
  "fileName": "burger.png",
  "contentType": "image/png",
  "folder": "menu-items"
}
```

Example response payload:
```json
{
  "method": "PUT",
  "uploadUrl": "https://...signed-url...",
  "key": "menu-items/<scope>/2026-03-16/<uuid>-burger.png",
  "fileUrl": "https://deliveryway.s3.<region>.amazonaws.com/menu-items/<scope>/2026-03-16/<uuid>-burger.png",
  "expiresIn": 300,
  "headers": {
    "Content-Type": "image/png"
  }
}
```

### Create presigned view URL
`POST /storage/presigned-view`

Body:
- `key?` — stored S3 object key
- `fileUrl?` — previously returned public file URL
- `expiresIn?` — optional GET URL expiry in seconds (`60`–`3600`)

Example request:
```json
{
  "fileUrl": "https://deliveryway.s3.eu-west-2.amazonaws.com/avatars/tenant-1/restaurant-1/branch-1/user-1/2026-03-16/avatar.png",
  "expiresIn": 180
}
```

Example response payload:
```json
{
  "method": "GET",
  "url": "https://...signed-get-url...",
  "key": "avatars/tenant-1/restaurant-1/branch-1/user-1/2026-03-16/avatar.png",
  "fileUrl": "https://deliveryway.s3.eu-west-2.amazonaws.com/avatars/tenant-1/restaurant-1/branch-1/user-1/2026-03-16/avatar.png",
  "expiresIn": 180
}
```

### Delete stored file
`DELETE /storage/object`

Body:
- `key?` — stored S3 object key
- `fileUrl?` — previously returned public file URL

Example request:
```json
{
  "key": "restaurant-logos/tenant-1/restaurant-1/user-9/2026-03-16/logo.png"
}
```

Example response payload:
```json
{
  "data": {
    "key": "restaurant-logos/tenant-1/restaurant-1/user-9/2026-03-16/logo.png",
    "fileUrl": "https://deliveryway.s3.eu-west-2.amazonaws.com/restaurant-logos/tenant-1/restaurant-1/user-9/2026-03-16/logo.png"
  },
  "message": "File deleted successfully"
}
```

---

## Frontend flow
1. Call `POST /storage/presigned-upload`
2. Upload file directly to `uploadUrl` using `PUT`
3. Send returned `fileUrl` in backend APIs like menu item image, branch cover image, restaurant logo, avatar, etc.
4. If bucket access is private, call `POST /storage/presigned-view` when a short-lived view URL is needed
5. Call `DELETE /storage/object` to remove a stored file when replacing/removing images
