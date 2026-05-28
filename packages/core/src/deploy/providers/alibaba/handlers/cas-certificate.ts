/**
 * Alibaba SSL Certificate Service handler — `alibaba.cas.certificate`.
 *
 * Backs Security.Certificate blocks. Uploads an existing PEM cert
 * (operator-supplied). Cert provisioning via ACME / Let's Encrypt is
 * a separate handler family (P2).
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.cas.certificate';
const SDK = '@alicloud/cas20200407';

export const cas_certificate_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const cas = await resolveClient(ctx, 'cas');
    if (!cas) return sdkMissing(name, TYPE, 'create', start, 'Alibaba CAS', SDK);
    if (!properties.cert_pem || !properties.key_pem) {
      return err(name, TYPE, 'create', start, 'Certificate requires properties.cert_pem and properties.key_pem');
    }
    try {
      const result = await cas.uploadUserCertificate({
        name,
        cert: properties.cert_pem as string,
        key: properties.key_pem as string,
      });
      const certId = (result?.body?.CertId ?? result?.body?.certId) as string | undefined;
      if (!certId) return err(name, TYPE, 'create', start, 'UploadUserCertificate returned no CertId');
      return ok(name, TYPE, 'create', start, { provider_id: String(certId) });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const cas = await resolveClient(ctx, 'cas');
    if (!cas) return err(name, TYPE, 'delete', start, 'Alibaba CAS SDK not available');
    try {
      await cas.deleteUserCertificate({ certId: Number(provider_id) });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
