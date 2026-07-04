import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { stockAdjustmentService } from '../services/stockAdjustmentService';
import toast from 'react-hot-toast';

export function useStockAdjustments(params?: any) {
  return useQuery({ queryKey: ['stock-adjustments', params], queryFn: () => stockAdjustmentService.getAll(params) });
}
export function useCreateStockAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: stockAdjustmentService.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-adjustments'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['kardex'] });
      qc.invalidateQueries({ queryKey: ['stock-movements'] });
      qc.invalidateQueries({ queryKey: ['product-lots'] });
      qc.invalidateQueries({ queryKey: ['product-lots-expiring'] });
      toast.success('Ajuste registrado');
    },
    onError: (err: any) => {
      const raw = err.response?.data?.message;
      const first = Array.isArray(raw) ? raw[0] : raw;
      const friendly: Record<string, string> = {
        'quantity must not be less than 0.01': 'La cantidad debe ser mayor a 0',
        'reason should not be empty': 'El motivo es obligatorio',
        'productId should not be empty': 'Debes seleccionar un producto',
        'companyId should not be empty': 'Debes seleccionar una empresa',
      };
      const msg = (first && friendly[first]) || (first?.includes('date') ? 'La fecha de vencimiento no es válida' : first) || 'Error al registrar el ajuste';
      toast.error(msg);
    },
  });
}
