import type { InfoContent } from '../_shared/types';

export const objectStorageInfo: InfoContent = {
  overview: {
    markdown: `
# Object Storage

A bucket for files. Think S3, GCS, Azure Blob. Unbounded, pay per GB, served
over HTTPS.

## When to use

- User uploads (avatars, attachments)
- Generated content (thumbnails, PDFs, exports)
- Database backups
- Static assets not served by a CDN

## Public vs private

Set \`publicRead: true\` only for assets that must be world-readable. For
private files, generate pre-signed URLs from your **Scalable Backend**.
    `.trim(),
  },
  compilesTo: {
    aws: [{ name: 'S3 Bucket', type: 'aws_s3_bucket' }, { name: 'Bucket Policy', type: 'aws_s3_bucket_policy', optional: true }],
    gcp: [{ name: 'GCS Bucket', type: 'google_storage_bucket' }],
    azure: [{ name: 'Storage Account', type: 'azurerm_storage_account' }, { name: 'Storage Container', type: 'azurerm_storage_container' }],
  },
  relatedConcepts: ['Compute.Container', 'Compute.StaticSite'],
};
