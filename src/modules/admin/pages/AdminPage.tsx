import { Link, Navigate } from 'react-router-dom';
import { Building2, Layers, Package, Ruler, ScrollText, Shield, ShoppingCart, Users, BarChart3, ArrowRight, GitBranch } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../../app/providers/AuthProvider';
import { useCompanies } from '../../companies/hooks/useCompanies';
import { useUsers } from '../../users/hooks/useUsers';
import { useProducts } from '../../products/hooks/useProducts';
import { useCategories } from '../../categories/hooks/useCategories';
import { useUnits } from '../../units/hooks/useUnits';
import { usePriceTiers } from '../../price-tiers/hooks/usePriceTiers';
import { useSales } from '../../sales/hooks/useSales';
import type { Company, PaginatedResponse, User } from '../../../shared/types';

type QuickLink = { to: string; label: string; description: string; icon: LucideIcon };

export function AdminPage() {
  const { user } = useAuth();

  if (!user || user.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  return <AdminDashboard user={user} />;
}

function AdminDashboard({ user }: { user: User }) {
  const { data: companiesData } = useCompanies();
  const { data: usersData } = useUsers({ limit: 500 });
  const { data: productsData } = useProducts({ limit: 1 });
  const { data: categoriesData } = useCategories();
  const { data: unitsData } = useUnits();
  const { data: tiersData } = usePriceTiers(false);
  const { data: salesData } = useSales({ limit: 1 });

  const companies: Company[] = Array.isArray(companiesData) ? companiesData : [];
  const users = (usersData as PaginatedResponse<User> | undefined)?.data ?? [];
  const activeUsers = users.filter((listedUser) => listedUser.isActive !== false);
  const activeCompanies = companies.filter((company) => company.isActive);
  const productsTotal = productsData?.total ?? 0;
  const salesTotal = salesData?.total ?? 0;
  const salesAmount = salesData?.totalAmount ?? 0;
  const categoriesTotal = Array.isArray(categoriesData) ? categoriesData.length : 0;
  const unitsTotal = Array.isArray(unitsData) ? unitsData.length : 0;
  const tiersTotal = Array.isArray(tiersData) ? tiersData.length : 0;

  const roleCounts = users.reduce((acc: Record<string, number>, listedUser) => {
    acc[listedUser.role] = (acc[listedUser.role] || 0) + 1;
    return acc;
  }, {});

  const quickLinks: QuickLink[] = [
    { to: '/companies', label: 'Empresas', description: 'Entidades fiscales y RUC', icon: Building2 },
    { to: '/users', label: 'Usuarios', description: 'Accesos y roles', icon: Shield },
    { to: '/branches', label: 'Sucursales', description: 'Tiendas y operación aislada', icon: GitBranch },
    { to: '/products', label: 'Productos', description: 'Catálogo maestro', icon: Package },
    { to: '/categories', label: 'Categorías', description: 'Estructura comercial', icon: Layers },
    { to: '/units', label: 'Unidades', description: 'Unidades de medida', icon: Ruler },
    { to: '/price-tiers', label: 'Rangos', description: 'Precios por empresa', icon: ScrollText },
    { to: '/sales', label: 'Ventas', description: 'Operación del día', icon: ShoppingCart },
    { to: '/dashboard', label: 'Resumen', description: 'Indicadores operativos', icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Panel Administrativo</h1>
          <p className="text-sm text-gray-500 mt-1">Control general de usuarios, catálogo y entidades fiscales.</p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-50 text-primary-700 border border-primary-100 text-sm font-medium">
          <Shield size={16} />
          {user?.fullName || user?.username}
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Empresas / RUC activos" value={activeCompanies.length} icon={Building2} />
        <StatCard label="Usuarios activos" value={activeUsers.length} icon={Users} />
        <StatCard label="Productos" value={productsTotal} icon={Package} />
        <StatCard label="Ventas" value={salesTotal} subtitle={`S/ ${salesAmount.toFixed(2)}`} icon={ShoppingCart} />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Categorías" value={categoriesTotal} />
        <StatCard label="Unidades" value={unitsTotal} />
        <StatCard label="Rangos" value={tiersTotal} />
        <StatCard label="Roles" value={Object.keys(roleCounts).length} subtitle={Object.entries(roleCounts).map(([role, count]) => `${role} ${count}`).join(' · ')} />
      </div>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800">Empresas</h2>
              <p className="text-xs text-gray-500">Entidades fiscales registradas en el sistema</p>
            </div>
            <span className="text-xs font-medium text-gray-500">{companies.length} total</span>
          </div>
          <div className="divide-y divide-gray-100">
            {companies.length === 0 ? (
              <div className="p-4 text-sm text-gray-400">No hay empresas registradas.</div>
            ) : companies.map((company) => (
              <div key={company.id} className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-gray-800 truncate">{company.name}</div>
                  <div className="text-xs text-gray-500 font-mono">{company.ruc}</div>
                  {company.address && <div className="text-xs text-gray-400 mt-1 truncate">{company.address}</div>}
                </div>
                <span className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-semibold ${company.isActive ? 'bg-primary-100 text-primary-800' : 'bg-red-100 text-red-800'}`}>
                  {company.isActive ? 'Activa' : 'Inactiva'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800">Accesos rápidos</h2>
              <p className="text-xs text-gray-500">Entradas operativas para administración</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className="flex items-start gap-3 rounded-xl border border-gray-200 p-3 hover:border-primary-300 hover:bg-primary-50 transition-colors"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 font-medium text-gray-800">
                      {link.label}
                      <ArrowRight size={14} className="text-gray-400" />
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5">{link.description}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, subtitle, icon: Icon }: { label: string; value: number | string; subtitle?: string; icon?: LucideIcon }) {
  return (
    <div className="bg-white rounded-xl shadow-card border border-gray-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">{label}</div>
          <div className="mt-1 text-2xl font-bold text-gray-800 tabular-nums">{value}</div>
          {subtitle && <div className="text-xs text-gray-500 mt-1 truncate">{subtitle}</div>}
        </div>
        {Icon && (
          <div className="h-10 w-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center shrink-0">
            <Icon size={18} />
          </div>
        )}
      </div>
    </div>
  );
}
