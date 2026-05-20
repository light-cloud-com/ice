/**
 * `resources` domain — high-level resource catalog browsing.
 *
 * The catalog drives the resource palette and search bar. Backed by
 * `/resources/*` endpoints that enumerate categories, individual
 * blocks, and the high-level → low-level mapping.
 *
 * Extracted from `http-api-adapter.ts` in rf-httpapi-2.
 */

import axiosInstance from '../axios-instance';
import type { IceAPI } from '../api-adapter';

export function createResourcesAdapter(): IceAPI['resources'] {
  return {
    getCategories: async () => {
      const res = await axiosInstance.get('/resources/categories');
      return res.data;
    },
    getAll: async () => {
      const res = await axiosInstance.get('/resources/all');
      return res.data;
    },
    getByCategory: async (categoryId: string) => {
      const res = await axiosInstance.get(`/resources/category/${encodeURIComponent(categoryId)}`);
      return res.data;
    },
    search: async (query: string) => {
      const res = await axiosInstance.get('/resources/search', { params: { q: query } });
      return res.data;
    },
    getLowLevel: async (highLevelId: string) => {
      const res = await axiosInstance.get(`/resources/low-level/${encodeURIComponent(highLevelId)}`);
      return res.data;
    },
  };
}
