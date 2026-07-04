import { api } from '../../../shared/services/api';

export const paymentAgreementService = {
  getAll: (params?: any) => api.get('/payment-agreements', { params }).then(r => r.data.data),
  getById: (id: string) => api.get(`/payment-agreements/${id}`).then(r => r.data.data),
  create: (data: { accountPayableIds: string[]; paymentScheduleType: string; currency?: 'PEN' | 'USD'; dueDate?: string; installments?: { amount: number; dueDate: string }[]; documentType?: 'FACTURA' | 'BOLETA'; documentSeries?: string; documentNumber?: string; remisionGuia?: { serie: string; correlativo: string; fecha: string }; notes?: string }) =>
    api.post('/payment-agreements', data).then(r => r.data.data),
  registerPayment: (id: string, data: { amount: number; codigoTransferencia: string; notes?: string }) =>
    api.post(`/payment-agreements/${id}/payments`, data).then(r => r.data.data),
  cancel: (id: string, data: { reason: string }) =>
    api.patch(`/payment-agreements/${id}/cancel`, data).then(r => r.data.data),
  uploadInstallmentVoucher: (agreementId: string, installmentId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/payment-agreements/${agreementId}/installments/${installmentId}/voucher`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data.data as { voucherUrl: string });
  },
  uploadVoucher: (agreementId: string, paymentId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/payment-agreements/${agreementId}/payments/${paymentId}/voucher`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data.data as { voucherUrl: string });
  },
};
