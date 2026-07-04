import { api } from '../../../shared/services/api';
export const purchaseService = {
  getAll: (params?: any) => api.get('/purchases', { params }).then((r) => r.data.data),
  getById: (id: string) => api.get(`/purchases/${id}`).then((r) => r.data.data),
  create: (data: any) => api.post('/purchases', data).then((r) => r.data.data),
  receive: (id: string, data: { items: { productId: string; quantity: number }[]; notes?: string }) =>
    api.post(`/purchases/${id}/receive`, data).then((r) => r.data.data),
  getProductSuppliers: (productId: string) =>
    api.get(`/purchases/by-product/${productId}/suppliers`).then((r) => r.data.data),
  updateRemisionGuia: (id: string, data: { serie: string; correlativo: string; fecha: string }) =>
    api.patch(`/purchases/${id}/remision-guia`, data).then((r) => r.data.data),
  getAccountPayable: (id: string) =>
    api.get(`/purchases/${id}/account-payable`).then((r) => r.data.data),
  update: (id: string, data: any) =>
    api.patch(`/purchases/${id}`, data).then((r) => r.data.data),
  editItems: (id: string, data: { companyId: string; edits?: any[]; additions?: any[]; bonificationAdditions?: any[] }) =>
    api.patch(`/purchases/${id}/items`, data).then((r) => r.data.data),
  delete: (id: string) => api.delete(`/purchases/${id}`).then((r) => r.data.data),
};
