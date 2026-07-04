import { useState, useRef, useEffect, useMemo } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { useAPAlerts } from '../../modules/accounts-payable/hooks/useAccountsPayable';
import { usePriceFloorAlerts } from '../../modules/products/hooks/useProducts';
import {
  Package, ShoppingCart, TrendingUp, TrendingDown, Users, Building2, Layers, ArrowLeftRight,
  LogOut, Menu, X, Wallet, CreditCard, BarChart3, FolderTree, Shield,
  ClipboardList, FileText, Bell, AlertTriangle, Clock, ScanLine, Ruler, ScrollText, Receipt, LayoutGrid,
} from 'lucide-react';
import type { AccountPayable } from '../types';

type NavItem = { path: string; label: string; icon: any; roles?: string[] };
type NavSection = { label: string; items: NavItem[] };

const BOTTOM_NAV = [
  { path: '/dashboard', label: 'Inicio', icon: BarChart3 },
  { path: '/cash-register', label: 'Caja', icon: Wallet },
  { path: '/pos', label: 'POS', icon: ScanLine },
  { path: '/accounts-payable', label: 'Por Pagar', icon: FileText },
];

const navSections: NavSection[] = [
  {
    label: 'PRINCIPAL',
    items: [{ path: '/dashboard', label: 'Inicio', icon: BarChart3 }],
  },
  {
    label: 'OPERACIONES',
    items: [
      { path: '/pos', label: 'POS', icon: ScanLine },
      { path: '/quotes', label: 'Cotizaciones', icon: ScrollText },
      { path: '/products', label: 'Productos', icon: Package },
      { path: '/purchases', label: 'Compras', icon: TrendingUp },
      { path: '/sales', label: 'Ventas', icon: ShoppingCart },
      { path: '/stock', label: 'Stock', icon: ArrowLeftRight },
      { path: '/kardex', label: 'Kardex', icon: ClipboardList },
    ],
  },
  {
    label: 'FINANZAS',
    items: [
      { path: '/cash-register', label: 'Caja', icon: Wallet },
      { path: '/credits', label: 'Créditos', icon: CreditCard },
      { path: '/accounts-payable', label: 'Cuentas por Pagar', icon: FileText },
      { path: '/invoices', label: 'Facturas', icon: Receipt },
    ],
  },
  {
    label: 'CATÁLOGO',
    items: [
      { path: '/clients', label: 'Clientes', icon: Users },
      { path: '/categories', label: 'Categorías', icon: FolderTree },
      { path: '/units', label: 'Unidades de Medida', icon: Ruler },
      { path: '/companies', label: 'Empresas', icon: Building2 },
      { path: '/price-tiers', label: 'Rangos de Precio', icon: Layers },
    ],
  },
  {
    label: 'CONFIGURACIÓN',
    items: [{ path: '/users', label: 'Usuarios', icon: Shield, roles: ['ADMIN'] }],
  },
];

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  const { data: apAlerts } = useAPAlerts(3);
  const { data: priceFloorData } = usePriceFloorAlerts();

  type PriceFloorItem = { id: string; name: string; minSalePrice: number; lowestPrice: number };
  const priceFloorItems: PriceFloorItem[] = priceFloorData?.products ?? [];

  type DayAlertGroup = { dateStr: string; count: number; total: number; isOverdue: boolean };

  const dayAlertGroups = useMemo((): DayAlertGroup[] => {
    if (!apAlerts) return [];
    const byDate: Record<string, DayAlertGroup> = {};
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today); maxDate.setDate(maxDate.getDate() + 3);

    const processAP = (ap: AccountPayable, isOverdue: boolean) => {
      if (ap.paymentScheduleType === 'INSTALLMENTS') {
        (ap.installments || []).forEach((inst: any) => {
          if (inst.status !== 'PENDING') return;
          const dateStr = inst.dueDate.slice(0, 10);
          const dueDate = new Date(dateStr + 'T00:00:00');
          if (isOverdue && dueDate >= today) return;
          if (!isOverdue && dueDate > maxDate) return;
          if (!byDate[dateStr]) byDate[dateStr] = { dateStr, count: 0, total: 0, isOverdue };
          byDate[dateStr].count++;
          byDate[dateStr].total += inst.amount;
        });
      } else if (ap.dueDate) {
        const dateStr = ap.dueDate.slice(0, 10);
        const dueDate = new Date(dateStr + 'T00:00:00');
        if (isOverdue && dueDate >= today) return;
        if (!isOverdue && dueDate > maxDate) return;
        if (!byDate[dateStr]) byDate[dateStr] = { dateStr, count: 0, total: 0, isOverdue };
        byDate[dateStr].count++;
        byDate[dateStr].total += ap.pendingAmount;
      }
    };

    (apAlerts.overdue || []).forEach((ap: AccountPayable) => processAP(ap, true));
    (apAlerts.upcoming || []).forEach((ap: AccountPayable) => processAP(ap, false));

    return Object.values(byDate).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  }, [apAlerts]);

  const alertCount = dayAlertGroups.length + priceFloorItems.length;

  const formatAlertDate = (dateStr: string): string => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const date = new Date(dateStr + 'T00:00:00');
    const diffDays = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return `Vencido · ${date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}`;
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Mañana';
    return `En ${diffDays} días · ${date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}`;
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => { setMoreOpen(false); setSidebarOpen(false); }, [location.pathname]);

  const userInitials = (user?.fullName || user?.username || 'U')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-screen flex bg-surface">
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:inset-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-5 border-b border-gray-100">
          <h1 className="text-base font-bold text-gray-800">Agrosystem</h1>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-gray-500">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-5">
          {navSections.map((section) => {
            const visibleItems = section.items.filter(
              (item) => !item.roles || item.roles.includes(user?.role || ''),
            );
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.label}>
                <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-gray-400">
                  {section.label}
                </div>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname.startsWith(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-primary-600 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <Icon size={18} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-gray-100 p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold text-sm">
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 truncate">
                {user?.fullName || user?.username}
              </div>
              <div className="text-xs text-gray-500 truncate">{user?.role}</div>
            </div>
            <button
              onClick={logout}
              title="Cerrar sesión"
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <header className="h-16 bg-primary-600 flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="hidden">
              <Menu size={20} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-white/15 hover:bg-white/25 transition-colors border border-white/20 rounded-full px-4 py-1.5 cursor-default">
              <span className="w-2 h-2 rounded-full bg-green-300 shadow-[0_0_6px_2px_rgba(134,239,172,0.6)]"></span>
              <span className="text-white text-sm font-semibold tracking-wide">Sucursal Principal</span>
            </div>

            <div className="relative" ref={bellRef}>
              <button
                onClick={() => setBellOpen(!bellOpen)}
                className="relative w-10 h-10 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-white transition-colors"
              >
                <Bell size={18} />
                {alertCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow">
                    {alertCount > 9 ? '9+' : alertCount}
                  </span>
                )}
              </button>
              {bellOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-card-hover border border-gray-100 z-50 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">Notificaciones</span>
                    {alertCount > 0 && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                        {alertCount}
                      </span>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {alertCount === 0 && (
                      <div className="px-4 py-6 text-center text-sm text-gray-400">
                        Sin alertas pendientes
                      </div>
                    )}
                    {priceFloorItems.length > 0 && (
                      <>
                        <div className="px-4 py-1.5 bg-orange-50 border-b border-orange-100 flex items-center gap-1.5">
                          <TrendingDown size={11} className="text-orange-500" />
                          <span className="text-[10px] font-bold tracking-wider text-orange-600">PRECIO MÍNIMO ALCANZADO</span>
                        </div>
                        {priceFloorItems.map((item) => (
                          <div key={item.id}
                            className="px-4 py-3 border-b border-gray-100 cursor-pointer bg-orange-50/60 hover:bg-orange-100 transition-colors"
                            onClick={() => { setBellOpen(false); navigate('/products'); }}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-orange-800 truncate">{item.name}</span>
                              <TrendingDown size={13} className="text-orange-500 flex-shrink-0" />
                            </div>
                            <div className="text-xs text-orange-600 mt-0.5">
                              Precio S/ {item.lowestPrice.toFixed(2)} · Mínimo S/ {item.minSalePrice.toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                    {dayAlertGroups.length > 0 && priceFloorItems.length > 0 && (
                      <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5">
                        <AlertTriangle size={11} className="text-amber-500" />
                        <span className="text-[10px] font-bold tracking-wider text-gray-500">CUENTAS POR PAGAR</span>
                      </div>
                    )}
                    {dayAlertGroups.map((group) => (
                      <div
                        key={group.dateStr}
                        className={`px-4 py-3 border-b border-gray-100 cursor-pointer transition-colors ${
                          group.isOverdue
                            ? 'bg-red-50/60 hover:bg-red-100'
                            : 'bg-amber-50/60 hover:bg-amber-100'
                        }`}
                        onClick={() => {
                          setBellOpen(false);
                          navigate(`/accounts-payable?date=${group.dateStr}`);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-semibold ${group.isOverdue ? 'text-red-700' : 'text-amber-700'}`}>
                            {formatAlertDate(group.dateStr)}
                          </span>
                          <span className={`text-sm font-bold ${group.isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                            S/ {group.total.toFixed(2)}
                          </span>
                        </div>
                        <div className={`text-xs mt-0.5 flex items-center gap-1 ${group.isOverdue ? 'text-red-500' : 'text-amber-600'}`}>
                          {group.isOverdue ? <AlertTriangle size={10} /> : <Clock size={10} />}
                          {group.count} pago{group.count > 1 ? 's' : ''} pendiente{group.count > 1 ? 's' : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                  {alertCount > 0 && (
                    <div className="px-4 py-2 bg-gray-50 border-t flex flex-col gap-1">
                      {priceFloorItems.length > 0 && (
                        <button onClick={() => { setBellOpen(false); navigate('/products'); }}
                          className="text-xs text-orange-600 hover:text-orange-800 font-medium w-full text-center">
                          Ver productos en precio mínimo
                        </button>
                      )}
                      {dayAlertGroups.length > 0 && (
                        <button onClick={() => { setBellOpen(false); navigate('/accounts-payable'); }}
                          className="text-xs text-primary-600 hover:text-primary-800 font-medium w-full text-center">
                          Ver calendario de pagos
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 pb-24 lg:p-8 overflow-auto min-w-0">
          <Outlet />
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 lg:hidden">
          <div className="flex items-stretch h-16">
            {BOTTOM_NAV.map(({ path, label, icon: Icon }) => {
              const isActive = path === '/dashboard'
                ? location.pathname === path || location.pathname === '/'
                : location.pathname.startsWith(path);

              if (path === '/pos') {
                return (
                  <div key={path} className="flex-1 relative flex items-center justify-center">
                    <Link
                      to={path}
                      className={`absolute -top-5 flex flex-col items-center justify-center w-14 h-14 rounded-full transition-all duration-200 active:scale-95 ${
                        isActive
                          ? 'bg-primary-700 shadow-[0_4px_18px_rgba(22,163,74,0.55)]'
                          : 'bg-primary-600 shadow-[0_4px_18px_rgba(22,163,74,0.40)]'
                      }`}
                    >
                      <Icon size={22} strokeWidth={2} className="text-white" />
                      <span className="text-[9px] font-bold text-white mt-0.5 tracking-wide">POS</span>
                    </Link>
                  </div>
                );
              }

              return (
                <Link
                  key={path}
                  to={path}
                  className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 pt-1 transition-colors ${
                    isActive ? 'text-primary-600' : 'text-gray-400'
                  }`}
                >
                  {isActive && (
                    <span className="absolute top-0 inset-x-3 h-0.5 bg-primary-600 rounded-b-full" />
                  )}
                  <div className={`p-1.5 rounded-xl transition-colors ${isActive ? 'bg-primary-50' : ''}`}>
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                  </div>
                  <span className="text-[10px] font-medium leading-none">{label}</span>
                </Link>
              );
            })}
            <button
              onClick={() => setMoreOpen(true)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 pt-1 transition-colors ${
                moreOpen ? 'text-primary-600' : 'text-gray-400'
              }`}
            >
              <div className={`p-1.5 rounded-xl transition-colors ${moreOpen ? 'bg-primary-50' : ''}`}>
                <LayoutGrid size={20} strokeWidth={1.8} />
              </div>
              <span className="text-[10px] font-medium leading-none">Más</span>
            </button>
          </div>
        </nav>

        {/* More — Bottom Sheet */}
        <div
          className={`fixed inset-0 bg-black/50 z-50 lg:hidden transition-opacity duration-300 ${
            moreOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setMoreOpen(false)}
        />
        <div
          className={`fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl max-h-[78vh] flex flex-col lg:hidden transition-transform duration-300 ease-out ${
            moreOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
            <span className="text-base font-bold text-gray-800">Menú</span>
            <button onClick={() => setMoreOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
              <X size={20} />
            </button>
          </div>
          <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">
            {navSections.map((section) => {
              const visibleItems = section.items.filter(
                (item) => !item.roles || item.roles.includes(user?.role || ''),
              );
              if (visibleItems.length === 0) return null;
              return (
                <div key={section.label}>
                  <div className="mb-2 text-[10px] font-bold tracking-widest text-gray-400">
                    {section.label}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {visibleItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setMoreOpen(false)}
                          className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl transition-colors text-center ${
                            isActive
                              ? 'bg-primary-50 text-primary-700'
                              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                          <span className="text-[10px] font-medium leading-tight">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-gray-100 px-5 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 truncate">{user?.fullName || user?.username}</div>
              <div className="text-xs text-gray-500">{user?.role}</div>
            </div>
            <button
              onClick={logout}
              className="text-gray-400 hover:text-red-500 transition-colors p-2"
              title="Cerrar sesión"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
