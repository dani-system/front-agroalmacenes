import { api } from '../../../shared/services/api';
import type { Branch } from '../../../shared/types';

export const branchService = {
  getAccessible: () => api.get<unknown, { data: { data: Branch[] } }>('/branches/accessible').then((response) => response.data.data),
  getAll: () => api.get<unknown, { data: { data: Branch[] } }>('/branches').then((response) => response.data.data),
  create: (data: Partial<Branch> & { companyIds: string[] }) => api.post('/branches', data).then((response) => response.data.data),
  update: (id: string, data: Partial<Branch>) => api.put(`/branches/${id}`, data).then((response) => response.data.data),
  setStatus: (id: string, isActive: boolean) => api.patch(`/branches/${id}/status`, { isActive }).then((response) => response.data.data),
};
