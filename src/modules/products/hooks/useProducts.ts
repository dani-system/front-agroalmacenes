import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productService } from '../services/productService';
import { productLotService } from '../../stock/services/productLotService';
import type { Product, ProductLot } from '../../../shared/types';
import toast from 'react-hot-toast';

interface ProductsPage { data: Product[]; total: number; }

export function useProducts(params?: any, options?: any) {
  return useQuery<ProductsPage>({ queryKey: ['products', params], queryFn: () => productService.getAll(params), ...options });
}
export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: productService.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Producto creado'); }, onError: (err: any) => { const msg = err.response?.data?.message; toast.error(Array.isArray(msg) ? msg[0] : msg || 'Error'); } });
}
export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => productService.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Producto actualizado'); } });
}
export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: productService.delete, onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Producto desactivado'); } });
}
export function usePriceFloorAlerts() {
  return useQuery({
    queryKey: ['price-floor-alerts'],
    queryFn: productService.getPriceFloorAlerts,
    staleTime: 2 * 60 * 1000,
  });
}
export function useCreateProductLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: productService.createLot,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-lots'] });
      qc.invalidateQueries({ queryKey: ['product-lots-expiring'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['kardex'] });
      qc.invalidateQueries({ queryKey: ['stock-movements'] });
      toast.success('Lote registrado');
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || 'Error al registrar lote');
    },
  });
}
export function useUploadProductImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => productService.uploadImage(id, file),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Imagen subida'); },
    onError: () => toast.error('Error al subir la imagen'),
  });
}

export function useProductLots(productId: string | null) {
  return useQuery<ProductLot[]>({
    queryKey: ['product-lots', productId],
    queryFn: () => productService.getLots(productId!),
    enabled: !!productId,
  });
}

export function useUpdateProductLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { lotNumber?: string; expirationDate?: string | null; isActive?: boolean } }) =>
      productLotService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-lots'] });
      toast.success('Lote actualizado');
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || 'Error al actualizar lote');
    },
  });
}
