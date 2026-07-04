import React, { useState } from 'react';
import { useCompanies, useCreateCompany, useUpdateCompany, useDeleteCompany } from '../hooks/useCompanies';
import { DataTable } from '../../../shared/components/DataTable';
import { Modal } from '../../../shared/components/Modal';
import { Plus, Edit2, Building2, Trash2 } from 'lucide-react';
import type { Company } from '../../../shared/types';

export function CompaniesPage() {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);

  const { data: companies, isLoading } = useCompanies();
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const deleteCompany = useDeleteCompany();

  const [form, setForm] = useState({ name: '', ruc: '', address: '', phone: '' });

  const openCreate = () => { setEditing(null); setForm({ name: '', ruc: '', address: '', phone: '' }); setShowModal(true); };
  const openEdit = (company: Company) => { setEditing(company); setForm({ name: company.name, ruc: company.ruc, address: company.address || '', phone: company.phone || '' }); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) { const { ruc, ...updateData } = form; await updateCompany.mutateAsync({ id: editing.id, data: updateData }); }
    else await createCompany.mutateAsync(form);
    setShowModal(false);
  };

  const list = Array.isArray(companies) ? companies : [];

  const columns = [
    { key: 'name', header: 'Nombre' },
    { key: 'ruc', header: 'RUC' },
    { key: 'address', header: 'Dirección' },
    { key: 'phone', header: 'Teléfono' },
    { key: 'isActive', header: 'Estado', render: (item: Company) => <span className={`px-2 py-1 rounded-full text-xs ${item.isActive ? 'bg-primary-100 text-primary-800' : 'bg-red-100 text-red-800'}`}>{item.isActive ? 'Activo' : 'Inactivo'}</span> },
    { key: 'actions', header: 'Acciones', render: (item: Company) => (
      <div className="flex gap-2">
        <button onClick={() => openEdit(item)} className="text-blue-600 hover:text-blue-800"><Edit2 size={16} /></button>
        {item.isActive && <button onClick={() => setDeleteTarget(item)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>}
      </div>
    )},
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Building2 size={24} /> Empresas</h1>
        <button onClick={openCreate} className="flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"><Plus size={18} /> Nueva Empresa</button>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {isLoading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Cargando...</div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center"><Building2 size={36} className="mx-auto mb-2 text-gray-200" /><p className="text-sm text-gray-400">Sin empresas registradas</p></div>
        ) : list.map((company: Company) => (
          <div key={company.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800">{company.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${company.isActive ? 'bg-primary-100 text-primary-800' : 'bg-red-100 text-red-800'}`}>
                    {company.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <span className="text-xs font-mono text-gray-500">RUC: {company.ruc}</span>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => openEdit(company)} className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
                  <Edit2 size={15} />
                </button>
                {company.isActive && <button onClick={() => setDeleteTarget(company)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 size={15} />
                </button>}
              </div>
            </div>
            <div className="flex flex-col gap-0.5 text-xs text-gray-500">
              {company.address && <span>{company.address}</span>}
              {company.phone && <span>Tel: {company.phone}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block">
        <DataTable columns={columns} data={list} isLoading={isLoading} />
      </div>
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Desactivar Empresa">
        <div className="space-y-4">
          <p className="text-gray-600 text-sm">¿Deseas desactivar la empresa <strong>{deleteTarget?.name}</strong>? Ya no aparecerá en listados ni en nuevas operaciones, pero su historial se mantiene intacto.</p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm">Cancelar</button>
            <button onClick={async () => { if (deleteTarget) { await deleteCompany.mutateAsync(deleteTarget.id); setDeleteTarget(null); } }} disabled={deleteCompany.isPending} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm">
              {deleteCompany.isPending ? 'Desactivando...' : 'Desactivar'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Editar Empresa' : 'Nueva Empresa'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">RUC (11 dígitos)</label><input value={form.ruc} onChange={(e) => setForm({ ...form, ruc: e.target.value })} className="w-full px-3 py-2 border rounded-lg" maxLength={11} pattern="\d{11}" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div>
          <button type="submit" disabled={editing ? updateCompany.isPending : createCompany.isPending} className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">{editing ? (updateCompany.isPending ? 'Actualizando...' : 'Actualizar') : (createCompany.isPending ? 'Creando...' : 'Crear')}</button>
        </form>
      </Modal>
    </div>
  );
}
