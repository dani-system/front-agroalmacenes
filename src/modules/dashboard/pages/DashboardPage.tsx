import { useState, useMemo } from 'react';
import { useDashboardSummary, useCreditsSummary, useSalesChart, useCategorySales, useTopSuppliers, useCategorySalesChart, useExchangeRate, usePurchaseByCategory, useFinancialOverview, useCategoryPurchaseChart, useSubcategorySalesChart, useSubcategoryPurchaseChart } from '../hooks/useDashboard';
import { useCategories } from '../../categories/hooks/useCategories';
import { useAPAlerts } from '../../accounts-payable/hooks/useAccountsPayable';
import { useAuth } from '../../../app/providers/AuthProvider';
import { TrendingUp, TrendingDown, DollarSign, CreditCard, FileText, AlertTriangle, Clock, Tag, Truck, ShoppingCart, Package, BarChart3, Wallet, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Sector,
} from 'recharts';
import type { AccountPayable } from '../../../shared/types';

const CHART_COLORS = ['#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];
const SUPPLIER_COLORS = ['#15803d', '#0ea5e9', '#f43f5e', '#84cc16', '#fb923c'];
const PIE_FINANCIAL_COLORS: Record<string, string> = {
  'Ingresos': '#16a34a',
  'Cuentas por pagar': '#8b5cf6',
  'Valor de stock': '#0ea5e9',
  'Stock vigente': '#0ea5e9',
  'Stock vencido': '#ef4444',
  'Créditos': '#f97316',
};

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function last30Days() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 29);
  return { start: toInputDate(start), end: toInputDate(now) };
}

function thisMonth() {
  const now = new Date();
  return { start: toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)), end: toInputDate(now) };
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function formatDateLong(d: Date) {
  return d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function DateRangeFilter({ range, onChange, onReset, resetLabel }: {
  range: { start: string; end: string };
  onChange: (r: { start: string; end: string }) => void;
  onReset: () => void;
  resetLabel: string;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="text-xs text-gray-500">Desde</label>
      <input
        type="date"
        value={range.start}
        max={range.end}
        onChange={(e) => onChange({ ...range, start: e.target.value })}
        className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      <label className="text-xs text-gray-500">Hasta</label>
      <input
        type="date"
        value={range.end}
        min={range.start}
        max={toInputDate(new Date())}
        onChange={(e) => onChange({ ...range, end: e.target.value })}
        className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      <button onClick={onReset} className="text-xs text-primary-600 hover:underline font-medium">{resetLabel}</button>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sublabel, accent }: {
  icon: any;
  label: string;
  value: string;
  sublabel?: string;
  accent: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-card p-5 hover:shadow-card-hover transition-shadow">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon size={14} />
        </div>
        {label}
      </div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      {sublabel && <div className="text-xs text-gray-400 mt-1">{sublabel}</div>}
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick, accent }: {
  icon: any;
  label: string;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl shadow-card p-5 hover:shadow-card-hover transition-all text-left group"
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${accent}`}>
        <Icon size={20} />
      </div>
      <div className="text-sm font-medium text-gray-700 group-hover:text-primary-700">{label}</div>
    </button>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [period, setPeriod] = useState('daily');
  const [salesRange, setSalesRange] = useState(last30Days);
  const [catChartRange, setCatChartRange] = useState(thisMonth);
  const [chartRange, setChartRange] = useState(thisMonth);
  const [disabledCats, setDisabledCats] = useState<Set<string>>(new Set());
  const [disabledPurchaseCats, setDisabledPurchaseCats] = useState<Set<string>>(new Set());
  const [purchaseCatChartRange, setPurchaseCatChartRange] = useState(thisMonth);
  const [subcatSalesParent, setSubcatSalesParent] = useState<string>('');
  const [subcatSalesRange, setSubcatSalesRange] = useState(thisMonth);
  const [disabledSubcatSales, setDisabledSubcatSales] = useState<Set<string>>(new Set());
  const [subcatPurchaseParent, setSubcatPurchaseParent] = useState<string>('');
  const [subcatPurchaseRange, setSubcatPurchaseRange] = useState(thisMonth);
  const [disabledSubcatPurchase, setDisabledSubcatPurchase] = useState<Set<string>>(new Set());
  const [exchangeDays, setExchangeDays] = useState(7);
  const [pieDetail, setPieDetail] = useState<{ label: string; pen: number; usd?: number; x: number; y: number } | null>(null);

  const { data: summary } = useDashboardSummary(period);
  const { data: creditsSummary } = useCreditsSummary();
  const { data: salesChart } = useSalesChart(salesRange.start, salesRange.end);
  const { data: apAlerts } = useAPAlerts(3);
  const { data: exchangeRateData, isLoading: exchangeLoading } = useExchangeRate(exchangeDays);
  const { data: categorySales } = useCategorySales(chartRange.start, chartRange.end);
  const { data: topSuppliers } = useTopSuppliers(chartRange.start, chartRange.end);
  const { data: catSalesChart } = useCategorySalesChart(catChartRange.start, catChartRange.end);
  const { data: purchaseByCategory } = usePurchaseByCategory(chartRange.start, chartRange.end);
  const { data: financialOverview } = useFinancialOverview();
  const { data: catPurchaseChart } = useCategoryPurchaseChart(purchaseCatChartRange.start, purchaseCatChartRange.end);
  const { data: allCategoriesData } = useCategories();
  const { data: subcatSalesChart } = useSubcategorySalesChart(subcatSalesParent || null, subcatSalesRange.start, subcatSalesRange.end);
  const { data: subcatPurchaseChart } = useSubcategoryPurchaseChart(subcatPurchaseParent || null, subcatPurchaseRange.start, subcatPurchaseRange.end);

  const dailySales = salesChart?.dailySales || [];
  const categorySalesData: { name: string; total: number }[] = Array.isArray(categorySales) ? categorySales : [];
  const topSuppliersData: { name: string; total: number; count: number }[] = Array.isArray(topSuppliers) ? topSuppliers : [];
  const catChartData: Record<string, any>[] = catSalesChart?.dailyData || [];
  const allCategories: string[] = catSalesChart?.categories || [];
  const purchaseByCategoryData: { name: string; total: number; count: number }[] = Array.isArray(purchaseByCategory) ? purchaseByCategory : [];
  const catPurchaseChartData: Record<string, any>[] = catPurchaseChart?.dailyData || [];
  const allPurchaseCategories: string[] = catPurchaseChart?.categories || [];
  const activePurchaseCategories = allPurchaseCategories.filter((c) => !disabledPurchaseCats.has(c));
  const purchaseCatTickInterval = catPurchaseChartData.length > 60 ? 6 : catPurchaseChartData.length > 30 ? 4 : 1;

  const parentCategories = (allCategoriesData || []).filter((c: any) => !c.parentId);
  const subcatSalesRaw: Record<string, any>[] = subcatSalesChart?.dailyData || [];
  const allSubcatSales: string[] = subcatSalesChart?.subcategories || [];
  const activeSubcatSales = allSubcatSales.filter((s) => !disabledSubcatSales.has(s));
  const subcatSalesTickInterval = subcatSalesRaw.length > 60 ? 6 : subcatSalesRaw.length > 30 ? 4 : 1;
  const subcatSalesData = subcatSalesRaw.map((row) => ({
    ...row,
    'Total categoría': Math.round(allSubcatSales.reduce((sum, s) => sum + (Number(row[s]) || 0), 0) * 100) / 100,
  }));

  const subcatPurchaseRaw: Record<string, any>[] = subcatPurchaseChart?.dailyData || [];
  const allSubcatPurchase: string[] = subcatPurchaseChart?.subcategories || [];
  const activeSubcatPurchase = allSubcatPurchase.filter((s) => !disabledSubcatPurchase.has(s));
  const subcatPurchaseTickInterval = subcatPurchaseRaw.length > 60 ? 6 : subcatPurchaseRaw.length > 30 ? 4 : 1;
  const subcatPurchaseData = subcatPurchaseRaw.map((row) => ({
    ...row,
    'Total categoría': Math.round(allSubcatPurchase.reduce((sum, s) => sum + (Number(row[s]) || 0), 0) * 100) / 100,
  }));

  const toggleSubcatSales = (s: string) => setDisabledSubcatSales((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  const toggleSubcatPurchase = (s: string) => setDisabledSubcatPurchase((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const financialPieData = useMemo(() => {
    if (!financialOverview) return [];
    const apTotal = (financialOverview.accountsPayable?.pen ?? 0) + (financialOverview.accountsPayable?.usd ?? 0);
    const expired = financialOverview.expiredStockValue ?? 0;
    const totalStock = financialOverview.stockValue ?? 0;
    const stockEntries = expired > 0
      ? [
          { name: 'Stock vigente', value: Math.max(0, totalStock - expired) },
          { name: 'Stock vencido', value: expired },
        ]
      : [{ name: 'Valor de stock', value: totalStock }];
    return [
      { name: 'Ingresos', value: financialOverview.income ?? 0 },
      { name: 'Cuentas por pagar', value: apTotal },
      ...stockEntries,
      { name: 'Créditos', value: financialOverview.credits ?? 0 },
    ].filter((d) => d.value > 0);
  }, [financialOverview]);

  const supplierPieData = useMemo(
    () => topSuppliersData.slice(0, 8).map((s) => ({ name: s.name, value: s.total })),
    [topSuppliersData],
  );

  const activeCategories = useMemo(
    () => allCategories.filter((c) => !disabledCats.has(c)),
    [allCategories, disabledCats],
  );

  const toggleCategory = (cat: string) => {
    setDisabledCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const togglePurchaseCategory = (cat: string) => {
    setDisabledPurchaseCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const periodLabels: Record<string, string> = { daily: 'Hoy', weekly: 'Esta Semana', monthly: 'Este Mes' };

  const salesTickInterval = dailySales.length > 60 ? 6 : dailySales.length > 30 ? 4 : 1;
  const catTickInterval = catChartData.length > 60 ? 6 : catChartData.length > 30 ? 4 : 1;

  const firstName = (user?.fullName || user?.username || '').split(' ')[0];
  const isVendedor = user?.role === 'VENDEDOR';

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          {greeting()}, {firstName || 'Bienvenido'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{formatDateLong(new Date())}</p>
      </div>

      {!isVendedor && (<>
      {/* Hero + period toggle */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 to-primary-700 text-white p-7 shadow-card">
        <div className="absolute -top-8 -right-8 w-48 h-48 bg-white/10 rounded-full" />
        <div className="absolute -bottom-16 -right-16 w-56 h-56 bg-white/5 rounded-full" />
        <div className="relative">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs font-semibold tracking-wider text-primary-100 mb-2 uppercase">
                Ingresos · {periodLabels[period]}
              </div>
              <div className="text-5xl font-bold">S/ {(summary?.totalIncome || 0).toFixed(2)}</div>
              <div className="text-sm text-primary-100 mt-2">
                Ganancia neta: S/ {(summary?.netProfit || 0).toFixed(2)}
              </div>
            </div>
            <div className="flex gap-1 bg-white/15 backdrop-blur rounded-lg p-1">
              {['daily', 'weekly', 'monthly'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    period === p ? 'bg-white text-primary-700' : 'text-white/90 hover:bg-white/10'
                  }`}
                >
                  {periodLabels[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-6 pt-5 border-t border-white/20 max-w-md">
            <div>
              <div className="text-xs text-primary-100">Egresos</div>
              <div className="text-xl font-semibold">S/ {(summary?.totalExpense || 0).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-primary-100">Créditos pendientes</div>
              <div className="text-xl font-semibold">S/ {(creditsSummary?.totalPending || 0).toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={TrendingUp}
          label="Ingresos"
          value={`S/ ${(summary?.totalIncome || 0).toFixed(2)}`}
          accent="bg-primary-100 text-primary-700"
        />
        <KpiCard
          icon={TrendingDown}
          label="Egresos"
          value={`S/ ${(summary?.totalExpense || 0).toFixed(2)}`}
          accent="bg-red-100 text-red-600"
        />
        <KpiCard
          icon={CreditCard}
          label="Créditos pendientes"
          value={`S/ ${(creditsSummary?.totalPending || 0).toFixed(2)}`}
          sublabel={`${creditsSummary?.activeCredits || 0} créditos activos`}
          accent="bg-orange-100 text-orange-600"
        />
        <KpiCard
          icon={FileText}
          label="Deuda proveedores"
          value={`S/ ${(apAlerts?.summary?.totalPending || 0).toFixed(2)}`}
          sublabel={`${apAlerts?.summary?.count || 0} cuentas activas`}
          accent="bg-purple-100 text-purple-600"
        />
      </div>
      </>)}

      {/* Quick actions */}
      <div>
        <div className="text-xs font-semibold tracking-wider text-gray-400 uppercase mb-3">
          Acciones rápidas
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickAction
            icon={ShoppingCart}
            label="Nueva Venta"
            onClick={() => navigate('/pos')}
            accent="bg-primary-100 text-primary-700"
          />
          <QuickAction
            icon={Package}
            label="Productos"
            onClick={() => navigate('/products')}
            accent="bg-blue-100 text-blue-600"
          />
          <QuickAction
            icon={Wallet}
            label="Caja"
            onClick={() => navigate('/cash-register')}
            accent="bg-orange-100 text-orange-600"
          />
          <QuickAction
            icon={BarChart3}
            label="Kardex"
            onClick={() => navigate('/kardex')}
            accent="bg-purple-100 text-purple-600"
          />
        </div>
      </div>

      {/* Tipo de Cambio USD/PEN */}
      <div className="bg-white rounded-xl shadow-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <DollarSign size={20} className="text-green-600" />
              Tipo de Cambio USD / PEN
            </h2>
            {Array.isArray(exchangeRateData) && exchangeRateData.length > 0 && (() => {
              const last = exchangeRateData[exchangeRateData.length - 1];
              return (
                <p className="text-xs text-gray-400 mt-0.5">
                  Último: <span className="font-semibold text-green-700">S/ {last.venta?.toFixed(3)}</span> venta · <span className="font-semibold text-blue-700">S/ {last.compra?.toFixed(3)}</span> compra
                  <span className="ml-2 text-gray-300">({last.date})</span>
                </p>
              );
            })()}
          </div>
          <div className="flex gap-1">
            {[{ label: '7 días', value: 7 }, { label: '15 días', value: 15 }, { label: '30 días', value: 30 }].map(opt => (
              <button
                key={opt.value}
                onClick={() => setExchangeDays(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${exchangeDays === opt.value ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {exchangeLoading ? (
          <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">Cargando tipo de cambio...</div>
        ) : !Array.isArray(exchangeRateData) || exchangeRateData.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">Sin datos disponibles</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={exchangeRateData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => {
                  const [, m, d] = v.split('-');
                  return `${d}/${m}`;
                }}
                interval={exchangeRateData.length > 20 ? 3 : exchangeRateData.length > 10 ? 1 : 0}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                domain={['auto', 'auto']}
                tickFormatter={(v) => `S/${v.toFixed(2)}`}
                width={62}
              />
              <Tooltip
                formatter={(value: any, name) => [`S/ ${Number(value).toFixed(3)}`, name === 'venta' ? 'Venta' : 'Compra']}
                labelFormatter={(label) => {
                  const [y, m, d] = label.split('-');
                  return `${d}/${m}/${y}`;
                }}
              />
              <Legend formatter={(v) => v === 'venta' ? 'Venta' : 'Compra'} />
              <Line type="monotone" dataKey="venta" stroke="#16a34a" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="compra" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {!isVendedor && (<>
      {/* Ventas chart */}
      <div className="bg-white rounded-xl shadow-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Ventas</h2>
          <DateRangeFilter range={salesRange} onChange={setSalesRange} onReset={() => setSalesRange(last30Days())} resetLabel="Últimos 30 días" />
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={dailySales}>
            <defs>
              <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={salesTickInterval} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `S/${v}`} />
            <Tooltip formatter={(value: any) => [`S/ ${Number(value || 0).toFixed(2)}`, 'Ventas']} />
            <Area type="monotone" dataKey="total" stroke="#16a34a" strokeWidth={2} fill="url(#colorSales)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Ventas por categorías */}
      <div className="bg-white rounded-xl shadow-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Ventas por Categorías</h2>
          <DateRangeFilter range={catChartRange} onChange={setCatChartRange} onReset={() => setCatChartRange(thisMonth())} resetLabel="Este mes" />
        </div>

        {allCategories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {allCategories.map((cat, i) => {
              const color = CHART_COLORS[i % CHART_COLORS.length];
              const enabled = !disabledCats.has(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all"
                  style={{
                    backgroundColor: enabled ? color : 'white',
                    borderColor: color,
                    color: enabled ? 'white' : color,
                  }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: enabled ? 'white' : color }} />
                  {cat}
                </button>
              );
            })}
          </div>
        )}

        {activeCategories.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={catChartData}>
              <defs>
                {activeCategories.map((cat) => {
                  const colorIdx = allCategories.indexOf(cat) % CHART_COLORS.length;
                  return (
                    <linearGradient key={cat} id={`grad-cat-${colorIdx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS[colorIdx]} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={CHART_COLORS[colorIdx]} stopOpacity={0} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={catTickInterval} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `S/${v}`} />
              <Tooltip formatter={(value: any, name: any) => [`S/ ${Number(value || 0).toFixed(2)}`, name]} />
              <Legend />
              {activeCategories.map((cat) => {
                const colorIdx = allCategories.indexOf(cat) % CHART_COLORS.length;
                return (
                  <Area
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    stroke={CHART_COLORS[colorIdx]}
                    strokeWidth={2}
                    fill={`url(#grad-cat-${colorIdx})`}
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">
            {allCategories.length === 0 ? 'Cargando categorías...' : 'Selecciona al menos una categoría'}
          </div>
        )}
      </div>

      {/* Compras por Categorías */}
      <div className="bg-white rounded-xl shadow-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Compras por Categorías</h2>
          <DateRangeFilter range={purchaseCatChartRange} onChange={setPurchaseCatChartRange} onReset={() => setPurchaseCatChartRange(thisMonth())} resetLabel="Este mes" />
        </div>

        {allPurchaseCategories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {allPurchaseCategories.map((cat, i) => {
              const color = CHART_COLORS[i % CHART_COLORS.length];
              const enabled = !disabledPurchaseCats.has(cat);
              return (
                <button
                  key={cat}
                  onClick={() => togglePurchaseCategory(cat)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all"
                  style={{
                    backgroundColor: enabled ? color : 'white',
                    borderColor: color,
                    color: enabled ? 'white' : color,
                  }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: enabled ? 'white' : color }} />
                  {cat}
                </button>
              );
            })}
          </div>
        )}

        {activePurchaseCategories.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={catPurchaseChartData}>
              <defs>
                {activePurchaseCategories.map((cat) => {
                  const colorIdx = allPurchaseCategories.indexOf(cat) % CHART_COLORS.length;
                  return (
                    <linearGradient key={cat} id={`grad-purch-${colorIdx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS[colorIdx]} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={CHART_COLORS[colorIdx]} stopOpacity={0} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={purchaseCatTickInterval} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `S/${v}`} />
              <Tooltip formatter={(value: any, name: any) => [`S/ ${Number(value || 0).toFixed(2)}`, name]} />
              <Legend />
              {activePurchaseCategories.map((cat) => {
                const colorIdx = allPurchaseCategories.indexOf(cat) % CHART_COLORS.length;
                return (
                  <Area
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    stroke={CHART_COLORS[colorIdx]}
                    strokeWidth={2}
                    fill={`url(#grad-purch-${colorIdx})`}
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">
            {allPurchaseCategories.length === 0 ? 'Sin datos para el período' : 'Selecciona al menos una categoría'}
          </div>
        )}
      </div>

      {/* Ventas por Subcategoría */}
      <div className="bg-white rounded-xl shadow-card p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Ventas por Subcategoría</h2>
          <p className="text-xs text-gray-400 mt-0.5">Elige una categoría padre para ver el desglose por subcategorías</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end pb-4 mb-4 border-b border-gray-100">
          <div className="flex flex-col gap-1 w-full sm:w-auto sm:flex-1 sm:max-w-[200px]">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Categoría</span>
            <select
              value={subcatSalesParent}
              onChange={(e) => { setSubcatSalesParent(e.target.value); setDisabledSubcatSales(new Set()); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="">— Seleccionar —</option>
              {parentCategories.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Período</span>
            <DateRangeFilter range={subcatSalesRange} onChange={setSubcatSalesRange} onReset={() => setSubcatSalesRange(thisMonth())} resetLabel="Este mes" />
          </div>
        </div>

        {!subcatSalesParent ? (
          <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">Selecciona una categoría para ver el gráfico</div>
        ) : allSubcatSales.length === 0 ? (
          <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">Sin subcategorías con ventas en este período</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              {allSubcatSales.map((s, i) => {
                const color = CHART_COLORS[i % CHART_COLORS.length];
                const enabled = !disabledSubcatSales.has(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleSubcatSales(s)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all"
                    style={{ backgroundColor: enabled ? color : 'white', borderColor: color, color: enabled ? 'white' : color }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: enabled ? 'white' : color }} />
                    {s}
                  </button>
                );
              })}
            </div>
            {activeSubcatSales.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={subcatSalesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={subcatSalesTickInterval} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `S/${v}`} />
                  <Tooltip formatter={(value: any, name: any) => [`S/ ${Number(value || 0).toFixed(2)}`, name]} />
                  <Legend />
                  {activeSubcatSales.map((s) => {
                    const colorIdx = allSubcatSales.indexOf(s) % CHART_COLORS.length;
                    return (
                      <Line
                        key={s}
                        type="monotone"
                        dataKey={s}
                        stroke={CHART_COLORS[colorIdx]}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    );
                  })}
                  <Line
                    type="monotone"
                    dataKey="Total categoría"
                    stroke="#1e293b"
                    strokeWidth={2.5}
                    strokeDasharray="6 3"
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">Selecciona al menos una subcategoría</div>
            )}
          </>
        )}
      </div>

      {/* Compras por Subcategoría */}
      <div className="bg-white rounded-xl shadow-card p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Compras por Subcategoría</h2>
          <p className="text-xs text-gray-400 mt-0.5">Elige una categoría padre para ver el desglose por subcategorías</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end pb-4 mb-4 border-b border-gray-100">
          <div className="flex flex-col gap-1 w-full sm:w-auto sm:flex-1 sm:max-w-[200px]">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Categoría</span>
            <select
              value={subcatPurchaseParent}
              onChange={(e) => { setSubcatPurchaseParent(e.target.value); setDisabledSubcatPurchase(new Set()); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="">— Seleccionar —</option>
              {parentCategories.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Período</span>
            <DateRangeFilter range={subcatPurchaseRange} onChange={setSubcatPurchaseRange} onReset={() => setSubcatPurchaseRange(thisMonth())} resetLabel="Este mes" />
          </div>
        </div>

        {!subcatPurchaseParent ? (
          <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">Selecciona una categoría para ver el gráfico</div>
        ) : allSubcatPurchase.length === 0 ? (
          <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">Sin subcategorías con compras en este período</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              {allSubcatPurchase.map((s, i) => {
                const color = CHART_COLORS[i % CHART_COLORS.length];
                const enabled = !disabledSubcatPurchase.has(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleSubcatPurchase(s)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all"
                    style={{ backgroundColor: enabled ? color : 'white', borderColor: color, color: enabled ? 'white' : color }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: enabled ? 'white' : color }} />
                    {s}
                  </button>
                );
              })}
            </div>
            {activeSubcatPurchase.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={subcatPurchaseData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={subcatPurchaseTickInterval} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `S/${v}`} />
                  <Tooltip formatter={(value: any, name: any) => [`S/ ${Number(value || 0).toFixed(2)}`, name]} />
                  <Legend />
                  {activeSubcatPurchase.map((s) => {
                    const colorIdx = allSubcatPurchase.indexOf(s) % CHART_COLORS.length;
                    return (
                      <Line
                        key={s}
                        type="monotone"
                        dataKey={s}
                        stroke={CHART_COLORS[colorIdx]}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    );
                  })}
                  <Line
                    type="monotone"
                    dataKey="Total categoría"
                    stroke="#1e293b"
                    strokeWidth={2.5}
                    strokeDasharray="6 3"
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">Selecciona al menos una subcategoría</div>
            )}
          </>
        )}
      </div>

      {/* Pie charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Torta: Vista Financiera General */}
        <div className="bg-white rounded-xl shadow-card p-5 relative">
          <h2 className="text-lg font-semibold text-gray-800 mb-1 flex items-center gap-2">
            <BarChart3 size={18} className="text-primary-600" /> Vista Financiera General
          </h2>
          <p className="text-xs text-gray-400 mb-4">Ingresos del mes vs obligaciones actuales — clic en un sector para ver montos</p>
          {financialPieData.length > 0 ? (() => {
            const total = financialPieData.reduce((s, d) => s + d.value, 0);
            return (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={financialPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={3}
                      dataKey="value"
                      onClick={(entry: any, _idx: number, event: any) => {
                        const isAP = entry.name === 'Cuentas por pagar';
                        setPieDetail({
                          label: entry.name,
                          pen: isAP ? (financialOverview?.accountsPayable?.pen ?? 0) : entry.value,
                          usd: isAP && (financialOverview?.accountsPayable?.usd ?? 0) > 0 ? financialOverview?.accountsPayable?.usd : undefined,
                          x: event?.clientX ?? 0,
                          y: event?.clientY ?? 0,
                        });
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {financialPieData.map((entry) => (
                        <Cell key={entry.name} fill={PIE_FINANCIAL_COLORS[entry.name] ?? '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any, name: any) => [`${((Number(value) / total) * 100).toFixed(1)}%`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  {financialPieData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_FINANCIAL_COLORS[d.name] ?? '#94a3b8' }} />
                      <span className="truncate">{d.name}</span>
                      <span className="ml-auto font-semibold text-gray-700">{((d.value / total) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
                {(financialOverview?.expiredStockValue ?? 0) > 0 && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                    <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                    <span className="text-xs text-red-700">
                      Stock vencido con cantidad disponible: <span className="font-bold">S/ {(financialOverview?.expiredStockValue ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                    </span>
                  </div>
                )}
              </>
            );
          })() : (
            <div className="flex items-center justify-center h-[240px] text-gray-400 text-sm">Sin datos disponibles</div>
          )}
        </div>

        {/* Torta: Compras por Proveedor */}
        <div className="bg-white rounded-xl shadow-card p-5 relative">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-1">
            <Truck size={18} className="text-purple-600" /> Compras por Proveedor
          </h2>
          <p className="text-xs text-gray-400 mb-3">Distribución del gasto por proveedor — clic en sector para ver monto exacto</p>
          <div className="flex items-center gap-2 flex-wrap border-t border-gray-100 pt-3 mb-3">
            <DateRangeFilter range={chartRange} onChange={setChartRange} onReset={() => setChartRange(thisMonth())} resetLabel="Este mes" />
          </div>
          {supplierPieData.length > 0 ? (() => {
            const total = supplierPieData.reduce((s, d) => s + d.value, 0);
            return (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={supplierPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={3}
                      dataKey="value"
                      onClick={(entry: any, _idx: number, event: any) => setPieDetail({ label: entry.name, pen: entry.value, x: event?.clientX ?? 0, y: event?.clientY ?? 0 })}
                      style={{ cursor: 'pointer' }}
                    >
                      {supplierPieData.map((_, i) => (
                        <Cell key={i} fill={SUPPLIER_COLORS[i % SUPPLIER_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any, name: any) => [`${((Number(value) / total) * 100).toFixed(1)}%`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  {supplierPieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SUPPLIER_COLORS[i % SUPPLIER_COLORS.length] }} />
                      <span className="truncate">{d.name}</span>
                      <span className="ml-auto font-semibold text-gray-700">{((d.value / total) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </>
            );
          })() : (
            <div className="flex items-center justify-center h-[240px] text-gray-400 text-sm">Sin datos para el período</div>
          )}
        </div>
      </div>

      {/* Pie detail popover */}
      {pieDetail && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPieDetail(null)} />
          <div
            className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-100 p-4 w-56"
            style={{
              left: Math.min(pieDetail.x + 14, (typeof window !== 'undefined' ? window.innerWidth : 800) - 240),
              top: Math.min(pieDetail.y - 8, (typeof window !== 'undefined' ? window.innerHeight : 600) - 140),
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{pieDetail.label}</span>
              <button className="text-gray-300 hover:text-gray-500 ml-2" onClick={() => setPieDetail(null)}>
                <X size={13} />
              </button>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-xs text-gray-400">Soles</span>
                <span className="text-xl font-bold text-gray-800">S/ {pieDetail.pen.toFixed(2)}</span>
              </div>
              {pieDetail.usd !== undefined && pieDetail.usd > 0 && (
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-xs text-gray-400">Dólares</span>
                  <span className="text-lg font-bold text-green-700">$ {pieDetail.usd.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Accounts Payable Alerts */}
      {((apAlerts?.overdue?.length || 0) > 0 || (apAlerts?.upcoming?.length || 0) > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(apAlerts?.overdue?.length || 0) > 0 && (
            <div className="bg-white rounded-xl shadow-card border-l-4 border-red-400 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-red-700 flex items-center gap-2"><AlertTriangle size={18} /> Pagos Vencidos</h2>
                <button onClick={() => navigate('/accounts-payable')} className="text-sm text-primary-600 hover:underline font-medium">Ver todos</button>
              </div>
              <div className="space-y-2">
                {apAlerts!.overdue.slice(0, 5).map((ap: AccountPayable) => (
                  <div key={ap.id} className="flex items-center justify-between text-sm bg-red-50 p-3 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-700">{ap.supplier}</div>
                      <div className="text-xs text-red-500">
                        Vencido: {ap.dueDate ? new Date(ap.dueDate).toLocaleDateString('es-PE') : ap.installments?.find(i => i.status === 'PENDING')?.dueDate ? new Date(ap.installments.find(i => i.status === 'PENDING')!.dueDate).toLocaleDateString('es-PE') : '-'}
                      </div>
                    </div>
                    <span className="font-bold text-red-600">S/ {ap.pendingAmount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(apAlerts?.upcoming?.length || 0) > 0 && (
            <div className="bg-white rounded-xl shadow-card border-l-4 border-yellow-400 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-yellow-700 flex items-center gap-2"><Clock size={18} /> Próximos a Vencer (3 días)</h2>
                <button onClick={() => navigate('/accounts-payable')} className="text-sm text-primary-600 hover:underline font-medium">Ver todos</button>
              </div>
              <div className="space-y-2">
                {apAlerts!.upcoming.slice(0, 5).map((ap: AccountPayable) => (
                  <div key={ap.id} className="flex items-center justify-between text-sm bg-yellow-50 p-3 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-700">{ap.supplier}</div>
                      <div className="text-xs text-yellow-600">
                        Vence: {ap.dueDate ? new Date(ap.dueDate).toLocaleDateString('es-PE') : ap.installments?.find(i => i.status === 'PENDING')?.dueDate ? new Date(ap.installments.find(i => i.status === 'PENDING')!.dueDate).toLocaleDateString('es-PE') : '-'}
                      </div>
                    </div>
                    <span className="font-bold text-yellow-700">S/ {ap.pendingAmount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      </>)}
    </div>
  );
}
