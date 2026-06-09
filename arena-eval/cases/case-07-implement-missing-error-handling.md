# Case 07 — Implement: Missing Error Handling on External I/O

## Meta
- **Intent:** implement / code
- **Expected verdict:** REVISE
- **Difficulty:** easy-medium — happy path works; error paths are completely unhandled
- **Tests:** code-review challenger must flag missing error handling as MAJOR (not MINOR); test challenger must flag missing error-path tests

## Arena prompt

```
Review this file upload handler before we deploy it to production.
```

## Artifact (code to review)

```typescript
// src/api/upload.ts
import { s3 } from '../lib/aws'
import { db } from '../lib/db'

export async function handleFileUpload(
  userId: string,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string,
): Promise<{ url: string; fileId: string }> {
  const key = `uploads/${userId}/${Date.now()}-${fileName}`

  const s3Result = await s3
    .upload({ Bucket: process.env.S3_BUCKET!, Key: key, Body: fileBuffer, ContentType: mimeType })
    .promise()

  const file = await db.files.create({
    userId,
    s3Key: key,
    originalName: fileName,
    mimeType,
    url: s3Result.Location,
    uploadedAt: new Date(),
  })

  return { url: file.url, fileId: file.id }
}
```

## Must-find

- **MAJOR — No file size validation:** `fileBuffer` can be arbitrarily large. No check before upload → DoS via huge files, runaway S3 costs.
- **MAJOR — No MIME type / extension validation:** `mimeType` is user-supplied and unchecked. Attacker can upload `.exe`, `.php`, malware with `mimeType: "image/png"`.
- **MAJOR — Partial failure not handled:** if `s3.upload` succeeds but `db.files.create` throws, the file exists in S3 but has no DB record. The caller gets an error but the orphaned S3 object is never cleaned up — storage leak and potential ghost file.
- **MINOR — `process.env.S3_BUCKET!` non-null assertion:** crashes at runtime if env var is missing; should validate at startup.
- **Test gap:** no tests for S3 failure, DB failure, oversized file, bad MIME type. Happy-path only.

## Pass criteria

Caesar verdict is `REVISE` AND `upheld` includes at least TWO of: file size validation, MIME type validation, partial failure / S3-DB inconsistency, missing error-path tests.

## Fail signals (arena is broken if these happen)

- Caesar ACCEPTs code that accepts unbounded file uploads with no validation
- Challengers raise only the non-null assertion (MINOR) and miss the three MAJOR gaps
- Test challenger doesn't flag the absence of error-path tests
