import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseService } from '../services/purchaseService';
import toast from 'react-hot-toast';

export function usePurchases(params?: any) {
  return useQuery({ queryKey: ['purchases', params], queryFn: () => purchaseService.getAll(params) });
}
export function usePurchase(id: string) {
  return useQuery({ queryKey: ['purchase', id], queryFn: () => purchaseService.getById(id), enabled: !!id });
}
export function usePurchaseAccountPayable(id: string) {
  return useQuery({ queryKey: ['purchase-ap', id], queryFn: () => purchaseService.getAccountPayable(id), enabled: !!id });
}
export function useProductSuppliers(productId: string) {
  return useQuery({
    queryKey: ['product-suppliers', productId],
    queryFn: () => purchaseService.getProductSuppliers(productId),
    enabled: !!productId,
    staleTime: 30_000,
  });
}
export function useCreatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: purchaseService.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['price-floor-alerts'] });
      qc.invalidateQueries({ queryKey: ['accounts-payable'] });
      toast.success('Compra registrada exitosamente');
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message;
      const text = Array.isArray(msg) ? 'Datos inválidos en el formulario. Verifica todos los campos e intenta de nuevo.' : (msg || 'Error al registrar la compra');
      toast.error(text);
    },
  });
}
export function useUpdateRemisionGuia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { serie: string; correlativo: string; fecha: string } }) =>
      purchaseService.updateRemisionGuia(id, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['purchase', vars.id] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      toast.success('Guía de remisión guardada');
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || 'Error al guardar la guía de remisión');
    },
  });
}
export function useUpdatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => purchaseService.update(id, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['purchase', vars.id] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['purchase-ap', vars.id] });
      qc.invalidateQueries({ queryKey: ['accounts-payable'] });
      toast.success('Compra actualizada correctamente');
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || 'Error al actualizar la compra');
    },
  });
}

export function useEditPurchaseItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { companyId: string; edits?: any[]; additions?: any[]; bonificationAdditions?: any[] } }) =>
      purchaseService.editItems(id, data),
    onSuccess: (data, vars) => {
      if (data) qc.setQueryData(['purchase', vars.id], data);
      qc.invalidateQueries({ queryKey: ['purchase', vars.id] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['product-lots'] });
      qc.invalidateQueries({ queryKey: ['kardex'] });
      toast.success('Productos actualizados correctamente');
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || 'Error al actualizar los productos');
    },
  });
}

export function useRegisterReception() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { items: { productId: string; quantity: number }[]; notes?: string } }) =>
      purchaseService.receive(id, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['purchase', vars.id] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['product-lots'] });
      qc.invalidateQueries({ queryKey: ['product-lots-expiring'] });
      qc.invalidateQueries({ queryKey: ['kardex'] });
      toast.success('Recepción registrada y stock actualizado');
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || 'Error al registrar la recepción');
    },
  });
}

export function useDeletePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: purchaseService.delete,
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: ['purchase', id] });
      qc.removeQueries({ queryKey: ['purchase-ap', id] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['product-lots'] });
      qc.invalidateQueries({ queryKey: ['accounts-payable'] });
      qc.invalidateQueries({ queryKey: ['payment-agreements'] });
      qc.invalidateQueries({ queryKey: ['kardex'] });
      toast.success('Compra eliminada correctamente');
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || 'Error al eliminar la compra');
    },
  });
}
