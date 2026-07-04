import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoryService } from '../services/categoryService';
import toast from 'react-hot-toast';

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: categoryService.getAll });
}
export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: categoryService.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); toast.success('Categoría creada'); }, onError: (err: any) => toast.error(err.response?.data?.message?.[0] || 'Error') });
}
export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => categoryService.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); toast.success('Categoría actualizada'); }, onError: (err: any) => { const msg = err.response?.data?.message; toast.error(Array.isArray(msg) ? msg[0] : msg || 'Error al actualizar la categoría'); } });
}
export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => categoryService.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); toast.success('Categoría eliminada'); }, onError: () => toast.error('Error al eliminar la categoría') });
}
