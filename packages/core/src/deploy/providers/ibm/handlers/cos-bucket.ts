/**
 * IBM Cloud Object Storage bucket handler — `ibm.cos.bucket`.
 *
 * COS is S3-compatible — reuses `ibm-cos-sdk`. Each COS bucket is
 * created against a parent COS instance (Resource Controller-managed);
 * the canvas wiring exposes `properties.cos_instance_crn`.
 */

import { err, isIbmNotFound, ok, sdkMissing } from './_result';
import { load_ibm_sdk } from '../sdk-loader';
import type { IBMResourceHandler } from '../types';

const TYPE = 'ibm.cos.bucket';
const SDK = 'ibm-cos-sdk';

async function build_cos_client(ctx: any): Promise<any | null> {
  const sdk = await load_ibm_sdk(SDK);
  if (!sdk?.S3) return null;
  return new sdk.S3({
    endpoint: `https://s3.${ctx.region}.cloud-object-storage.appdomain.cloud`,
    apiKeyId: ctx.credentials.api_key,
    serviceInstanceId: ctx.credentials.account_id ?? '',
    signatureVersion: 'iam',
  });
}

export const cos_bucket_handler: IBMResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    if (!properties.cos_instance_crn) {
      return err(name, TYPE, 'create', start, 'COS bucket requires properties.cos_instance_crn');
    }
    const cos = await build_cos_client(ctx);
    if (!cos) return sdkMissing(name, TYPE, 'create', start, 'IBM COS', SDK);
    try {
      await cos
        .createBucket({
          Bucket: name,
          CreateBucketConfiguration: { LocationConstraint: `${ctx.region}-standard` },
          IBMServiceInstanceId: properties.cos_instance_crn as string,
        })
        .promise();
      return ok(name, TYPE, 'create', start, { provider_id: name });
    } catch (error) {
      const e = error as { code?: string; statusCode?: number };
      if (e.code === 'BucketAlreadyOwnedByYou' || e.statusCode === 409) {
        return ok(name, TYPE, 'create', start, { provider_id: name });
      }
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const cos = await build_cos_client(ctx);
    if (!cos) return err(name, TYPE, 'delete', start, 'IBM COS SDK not available');
    try {
      await cos.deleteBucket({ Bucket: provider_id }).promise();
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isIbmNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
