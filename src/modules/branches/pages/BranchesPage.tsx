import { useState } from 'react';
import { Building2, Check, Pencil, Plus, Power } from 'lucide-react';
import { Modal } from '../../../shared/components/Modal';
import { PageHeader } from '../../../shared/components/PageHeader';
import { useCompanies } from '../../companies/hooks/useCompanies';
import { useBranches, useCreateBranch, useToggleBranch, useUpdateBranch } from '../hooks/useBranches';
import type { Branch, Company } from '../../../shared/types';

type FormState = { code: string; name: string; address: string; phone: string; companyIds: string[]; defaultCompanyId: string; isMain: boolean };
const emptyForm: FormState = { code: '', name: '', address: '', phone: '', companyIds: [], defaultCompanyId: '', isMain: false };

export function BranchesPage() {
  const { data: branches = [], isLoading } = useBranches();
  const { data: companiesData } = useCompanies();
  const companies: Company[] = Array.isArray(companiesData) ? companiesData : [];
  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const toggleBranch = useToggleBranch();
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isOpen, setIsOpen] = useState(false);

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm, companyIds: [] }); setIsOpen(true); };
  const openEdit = (branch: Branch) => { setEditing(branch); setForm({ code: branch.code, name: branch.name, address: branch.address || '', phone: branch.phone || '', companyIds: branch.companyIds, defaultCompanyId: branch.defaultCompanyId || '', isMain: branch.isMain }); setIsOpen(true); };
  const toggleCompany = (id: string) => setForm((current) => {
    const companyIds = current.companyIds.includes(id) ? current.companyIds.filter((companyId) => companyId !== id) : [...current.companyIds, id];
    return { ...current, companyIds, defaultCompanyId: companyIds.includes(current.defaultCompanyId) ? current.defaultCompanyId : companyIds[0] || '' };
  });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.companyIds.length) return;
    if (editing) await updateBranch.mutateAsync({ id: editing.id, data: form });
    else await createBranch.mutateAsync(form);
    setEditing(null);
    setIsOpen(false);
  };

  return <div>
    <PageHeader title="Sucursales" subtitle="Administra tiendas, empresas fiscales y disponibilidad operativa" icon={Building2} actions={<button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"><Plus size={17} /> Nueva sucursal</button>} />
    {isLoading ? <div className="py-16 text-center text-gray-400">Cargando sucursales...</div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {branches.map((branch) => <div key={branch.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-gray-800">{branch.name}</div><div className="font-mono text-xs text-gray-500">{branch.code}</div></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${branch.isActive ? 'bg-primary-100 text-primary-800' : 'bg-red-100 text-red-800'}`}>{branch.isActive ? 'Activa' : 'Inactiva'}</span></div>
        <div className="mt-4 space-y-1 text-sm text-gray-600"><div>{branch.address || 'Sin dirección'}</div><div>{branch.phone || 'Sin teléfono'}</div><div className="text-xs text-gray-400">{branch.companyIds.length} empresa(s) fiscal(es){branch.isMain ? ' · Principal' : ''}</div></div>
        <div className="mt-4 flex gap-2 border-t border-gray-100 pt-3"><button onClick={() => openEdit(branch)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700"><Pencil size={14} /> Editar</button><button onClick={() => toggleBranch.mutate({ id: branch.id, isActive: !branch.isActive })} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${branch.isActive ? 'bg-red-50 text-red-700' : 'bg-primary-50 text-primary-700'}`}><Power size={14} /> {branch.isActive ? 'Desactivar' : 'Activar'}</button></div>
      </div>)}
    </div>}
    <Modal isOpen={isOpen} onClose={() => { setEditing(null); setForm(emptyForm); setIsOpen(false); }} title={editing ? 'Editar sucursal' : 'Nueva sucursal'}>
      <form onSubmit={submit} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">Código<input required value={form.code} disabled={!!editing} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm font-medium text-gray-700">Nombre<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">Dirección<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm font-medium text-gray-700">Teléfono<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label></div><div><div className="mb-2 text-sm font-medium text-gray-700">Empresas fiscales</div><div className="space-y-2">{companies.map((company) => <label key={company.id} className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.companyIds.includes(company.id)} onChange={() => toggleCompany(company.id)} /><span>{company.name} · {company.ruc}</span></label>)}</div></div><label className="text-sm font-medium text-gray-700">Empresa predeterminada<select required value={form.defaultCompanyId} onChange={(e) => setForm({ ...form, defaultCompanyId: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Seleccionar</option>{companies.filter((company) => form.companyIds.includes(company.id)).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.isMain} onChange={(e) => setForm({ ...form, isMain: e.target.checked })} /><Check size={15} /> Marcar como sucursal principal</label><button disabled={createBranch.isPending || updateBranch.isPending || !form.companyIds.length} className="w-full rounded-lg bg-primary-600 py-2.5 font-medium text-white disabled:opacity-50">Guardar sucursal</button></form>
    </Modal>
  </div>;
}
