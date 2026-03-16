# Storage Module — DeliveryWays

## Purpose
Provides S3 presigned upload URLs so the frontend can upload images directly to AWS S3 and then send the returned `fileUrl` back in normal backend create/update requests.

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
- `folder?` — optional bucket prefix like `menu-items`, `restaurant-logos`, `branch-covers`, `avatars`

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

Frontend flow:
1. Call `POST /storage/presigned-upload`
2. Upload file directly to `uploadUrl` using `PUT`
3. Send returned `fileUrl` in backend APIs like menu item image, branch cover image, restaurant logo, avatar, etc.
