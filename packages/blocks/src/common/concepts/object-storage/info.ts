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
    markdownZh: `
# 对象存储

存放文件的存储桶。可类比 S3、GCS、Azure Blob。容量无上限,按 GB 计费,通过 HTTPS 提供访问。

## 适用场景

- 用户上传(头像、附件)
- 生成内容(缩略图、PDF、导出文件)
- 数据库备份
- 未经 CDN 分发的静态资源

## 公开 vs 私有

仅当资源必须对全网可读时,才设置 \`publicRead: true\`。对于私有文件,请从 **可扩展后端** 生成预签名 URL。
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'S3 Bucket', type: 'aws_s3_bucket' },
      { name: 'Bucket Policy', type: 'aws_s3_bucket_policy', optional: true },
    ],
    gcp: [{ name: 'GCS Bucket', type: 'google_storage_bucket' }],
    azure: [
      { name: 'Storage Account', type: 'azurerm_storage_account' },
      { name: 'Storage Container', type: 'azurerm_storage_container' },
    ],
  },
  relatedConcepts: ['Compute.Container', 'Compute.StaticSite'],
};
