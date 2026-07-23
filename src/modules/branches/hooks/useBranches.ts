import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { branchService } from '../services/branchService';

export function useBranches() {
  return useQuery({ queryKey: ['branches'], queryFn: branchService.getAll });
}

export function useCreateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: branchService.create,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branches'] }); toast.success('Sucursal creada'); },
    onError: (error: any) => toast.error(error.response?.data?.message || 'No se pudo crear la sucursal'),
  });
}

export function useUpdateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => branchService.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branches'] }); toast.success('Sucursal actualizada'); },
    onError: (error: any) => toast.error(error.response?.data?.message || 'No se pudo actualizar la sucursal'),
  });
}

export function useToggleBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => branchService.setStatus(id, isActive),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branches'] }); toast.success('Estado de sucursal actualizado'); },
    onError: (error: any) => toast.error(error.response?.data?.message || 'No se pudo cambiar el estado'),
  });
}
