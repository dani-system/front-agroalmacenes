import React, { useState } from 'react';
import { useUsers, useCreateUser, useUpdateUser, useChangePassword, useToggleUserStatus } from '../hooks/useUsers';
import { DataTable } from '../../../shared/components/DataTable';
import { Modal } from '../../../shared/components/Modal';
import { Pagination } from '../../../shared/components/Pagination';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import { Plus, Search, Edit2, Key, Power } from 'lucide-react';
import type { User } from '../../../shared/types';
import { useAuth } from '../../../app/providers/AuthProvider';

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const isVendedor = currentUser?.role === 'VENDEDOR';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordUser, setPasswordUser] = useState<User | null>(null);

  const params: any = isVendedor
    ? { page: 1, limit: 20, search: currentUser?.username ?? '' }
    : { page, limit: 20, search: debouncedSearch };
  if (!isVendedor && roleFilter) params.role = roleFilter;
  if (!isVendedor && statusFilter) params.isActive = statusFilter;

  const { data, isLoading } = useUsers(params);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const changePassword = useChangePassword();
  const toggleStatus = useToggleUserStatus();

  const [createForm, setCreateForm] = useState({ username: '', email: '', password: '', fullName: '', role: 'VENDEDOR' });
  const [editForm, setEditForm] = useState({ fullName: '', role: '', username: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({ newPassword: '' });

  const openCreate = () => {
    setCreateForm({ username: '', email: '', password: '', fullName: '', role: 'VENDEDOR' });
    setShowCreateModal(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setEditForm({ fullName: user.fullName, role: user.role, username: user.username, email: user.email || '' });
  };

  const openPassword = (user: User) => {
    setPasswordUser(user);
    setPasswordForm({ newPassword: '' });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { username: createForm.username, password: createForm.password, fullName: createForm.fullName, role: createForm.role };
    if (createForm.email) payload.email = createForm.email;
    await createUser.mutateAsync(payload);
    setShowCreateModal(false);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const payload: any = { fullName: editForm.fullName, role: editForm.role, username: editForm.username };
    if (editForm.email) payload.email = editForm.email;
    else payload.email = '';
    await updateUser.mutateAsync({ id: editingUser.id, data: payload });
    setEditingUser(null);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordUser) return;
    await changePassword.mutateAsync({ id: passwordUser.id, data: passwordForm });
    setPasswordUser(null);
  };

  const allUsers: User[] = data?.data || [];
  const users = isVendedor ? allUsers.filter(u => u.id === currentUser?.id) : allUsers;
  const total = isVendedor ? users.length : (data?.total || 0);

  const columns = [
    { key: 'fullName', header: 'Nombre' },
    { key: 'username', header: 'Usuario' },
    { key: 'email', header: 'Email', render: (item: User) => <span>{item.email || '-'}</span> },
    {
      key: 'role', header: 'Rol', render: (item: User) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
          {item.role}
        </span>
      ),
    },
    {
      key: 'isActive', header: 'Estado', render: (item: User) => (
        <span className={`px-2 py-1 rounded-full text-xs ${item.isActive ? 'bg-primary-100 text-primary-800' : 'bg-red-100 text-red-800'}`}>
          {item.isActive ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      key: 'actions', header: 'Acciones', render: (item: User) => (
        <div className="flex gap-2">
          <button onClick={() => openEdit(item)} className="text-blue-600 hover:text-blue-800" title="Editar"><Edit2 size={16} /></button>
          <button onClick={() => openPassword(item)} className="text-yellow-600 hover:text-yellow-800" title="Cambiar contrasena"><Key size={16} /></button>
          {!isVendedor && (
            <button onClick={() => toggleStatus.mutate(item.id)} disabled={toggleStatus.isPending} className={`${item.isActive ? 'text-red-600 hover:text-red-800' : 'text-primary-600 hover:text-primary-800'} disabled:opacity-40 disabled:cursor-not-allowed`} title={item.isActive ? 'Desactivar' : 'Activar'}><Power size={16} /></button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Usuarios</h1>
        {!isVendedor && (
          <button onClick={openCreate} className="flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
            <Plus size={18} /> Nuevo Usuario
          </button>
        )}
      </div>

      {!isVendedor && (
        <div className="mb-4 flex flex-col gap-2">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" placeholder="Buscar por nombre o usuario..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 text-sm">
              <option value="">Todos los roles</option>
              <option value="ADMIN">Admin</option>
              <option value="VENDEDOR">Vendedor</option>
            </select>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 text-sm">
              <option value="">Todos los estados</option>
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </div>
        </div>
      )}

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {isLoading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Cargando...</div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">Sin usuarios</div>
        ) : users.map((user: User) => (
          <div key={user.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            {/* Name + role */}
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="font-semibold text-gray-800 leading-snug">{user.fullName}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${user.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                {user.role}
              </span>
            </div>
            {/* Username + status */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs text-gray-500 font-mono">@{user.username}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${user.isActive ? 'bg-primary-100 text-primary-800' : 'bg-red-100 text-red-800'}`}>
                {user.isActive ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            {user.email && <p className="text-xs text-gray-400 mb-3 truncate">{user.email}</p>}
            {/* Actions */}
            <div className={`grid gap-2 ${isVendedor ? 'grid-cols-2' : 'grid-cols-3'}`}>
              <button onClick={() => openEdit(user)} className="flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                <Edit2 size={13} /> Editar
              </button>
              <button onClick={() => openPassword(user)} className="flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100 rounded-lg transition-colors">
                <Key size={13} /> Clave
              </button>
              {!isVendedor && (
                <button
                  onClick={() => toggleStatus.mutate(user.id)}
                  disabled={toggleStatus.isPending}
                  className={`flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 ${user.isActive ? 'text-red-600 bg-red-50 hover:bg-red-100' : 'text-primary-600 bg-primary-50 hover:bg-primary-100'}`}>
                  <Power size={13} /> {user.isActive ? 'Desact.' : 'Activar'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block">
        <DataTable columns={columns} data={users} isLoading={isLoading} />
      </div>

      <Pagination page={page} totalPages={Math.ceil(total / 20)} onPageChange={setPage} />

      {/* Modal Crear */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Nuevo Usuario">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
            <input value={createForm.fullName} onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
            <input value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required minLength={3} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-gray-400">(opcional)</span></label>
            <input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contrasena</label>
            <input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required minLength={6} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
            <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
              <option value="VENDEDOR">Vendedor</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <button type="submit" disabled={createUser.isPending} className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {createUser.isPending ? 'Creando...' : 'Crear Usuario'}
          </button>
        </form>
      </Modal>

      {/* Modal Editar */}
      <Modal isOpen={!!editingUser} onClose={() => setEditingUser(null)} title="Editar Usuario">
        <form onSubmit={handleEdit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
            <input value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
            <input value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required minLength={3} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-gray-400">(opcional)</span></label>
            <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
            <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
              <option value="VENDEDOR">Vendedor</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <button type="submit" disabled={updateUser.isPending} className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {updateUser.isPending ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </form>
      </Modal>

      {/* Modal Cambiar Contrasena */}
      <Modal isOpen={!!passwordUser} onClose={() => setPasswordUser(null)} title={`Cambiar contrasena - ${passwordUser?.fullName}`}>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contrasena</label>
            <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ newPassword: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required minLength={6} />
          </div>
          <button type="submit" disabled={changePassword.isPending} className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {changePassword.isPending ? 'Cambiando...' : 'Cambiar Contrasena'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
