import { api } from '../../../shared/services/api';
export const productService = {
  getAll: (params?: any) => api.get('/products', { params }).then((r) => r.data.data),
  getById: (id: string) => api.get(`/products/${id}`).then((r) => r.data.data),
  create: (data: any) => api.post('/products', data).then((r) => r.data.data),
  update: (id: string, data: any) => api.put(`/products/${id}`, data).then((r) => r.data.data),
  delete: (id: string) => api.delete(`/products/${id}`).then((r) => r.data.data),
  getPriceFloorAlerts: () => api.get('/products/price-floor-alerts').then((r) => r.data),
  getLots: (productId: string) => api.get('/product-lots', { params: { productId, activeOnly: 'false' } }).then((r) => r.data.data),
  createLot: (data: { productId: string; companyId: string; lotNumber: string; expirationDate?: string; quantity: number }) =>
    api.post('/product-lots', data).then((r) => r.data.data),
  importExcel: (file: File): Promise<{ created: number; updated: number; errors: string[] }> => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/products/import', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
  uploadImage: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/products/${id}/image`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.data as { imageUrl: string });
  },
};
