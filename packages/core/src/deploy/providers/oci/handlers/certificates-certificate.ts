/**
 * OCI Certificates Management handler — `oci.certificates.certificate`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.certificates.certificate';
const SDK = 'oci-certificatesmanagement';

export const certificates_certificate_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const cm = await resolveClient(ctx, 'certificatesmanagement');
    if (!cm) return sdkMissing(name, TYPE, 'create', start, 'OCI Certificates', SDK);
    if (!properties.cert_pem || !properties.key_pem) {
      return err(name, TYPE, 'create', start, 'Certificate requires cert_pem and key_pem');
    }
    try {
      const result = await cm.createCertificate({
        createCertificateDetails: {
          name,
          compartmentId: ctx.compartment_id,
          certificateConfig: {
            configType: 'IMPORTED',
            certChainPem: properties.cert_pem as string,
            privateKeyPem: properties.key_pem as string,
            certificatePem: properties.cert_pem as string,
          },
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.certificate?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createCertificate returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isOciAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const cm = await resolveClient(ctx, 'certificatesmanagement');
    if (!cm) return err(name, TYPE, 'delete', start, 'OCI Certificates SDK not available');
    try {
      // OCI Certificates uses scheduleCertificateDeletion (soft-delete
      // with a default 30-day cancellation window) rather than an
      // immediate delete. Schedule for tomorrow.
      const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString();
      await cm.scheduleCertificateDeletion({
        certificateId: provider_id,
        scheduleCertificateDeletionDetails: { timeOfDeletion: tomorrow },
      });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
