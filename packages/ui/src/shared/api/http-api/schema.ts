/**
 * `schema` domain — resource-type schema lookups.
 *
 * Schemas describe the shape of a single ICE block (its supported
 * properties, required fields, default values). Backed by the
 * platform's `/schemas/*` endpoints.
 *
 * Extracted from `http-api-adapter.ts` in rf-httpapi-2.
 */

import axiosInstance from '../axios-instance';
import type { IceAPI } from '../api-adapter';

export function createSchemaAdapter(): IceAPI['schema'] {
  return {
    getCategories: async () => {
      const res = await axiosInstance.get('/schemas/categories');
      return res.data;
    },
    query: async (query) => {
      const res = await axiosInstance.get('/schemas/query', { params: query });
      return res.data;
    },
    get: async (iceType: string) => {
      const res = await axiosInstance.get(`/schemas/${encodeURIComponent(iceType)}`);
      return res.data;
    },
  };
}
