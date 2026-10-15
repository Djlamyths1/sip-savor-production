
import { useState } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  ChefHat,
  Factory,
  Receipt,
  BarChart3,
  ShoppingCart,
  ArrowDownToLine,
  Users,
  CreditCard,
  Menu,
  X,
  Coffee,
  LogOut,
  UserCog,
} from 'lucide-react';
import { NAV_ITEMS, type NavId } from '@/lib/constants';
import { classNames } from '@/lib/utils';

type PermissionLevel = 'none' | 'enter' | 'view' | 'manage';

const ICON_MAP: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  LayoutDashboard,
  Package,
  ShoppingBag,
  ChefHat,
  Factory,
  Receipt,
  BarChart3,
  ShoppingCart,
  ArrowDownToLine,
  Users,
  CreditCard,
  UserCog,
};

interface LayoutProps {
  activePage: NavId;
  onNavigate: (page: NavId) => void;
  children: React.ReactNode;
  userEmail?: string;
  onSignOut?: () => void;
  permissions?: string[];
  permissionLevels?: Record<string, PermissionLevel>;
}

const NAV_PERMISSION_MAP: Partial<Record<NavId, string>> = {
  dashboard: 'dashboard.view',
  'raw-materials': 'raw_materials.view',
  'stock-in': 'stock_in.create',
  products: 'products.view',
  recipes: 'recipes.view',
  production: 'production.create',
  sales: 'sales.create',
  customers: 'customers.view',
  payments: 'payments.create',
  deliveries: 'deliveries.view',
  expenses: 'expenses.create',
  reports: 'reports.sales',
  'user-management': 'users.view',

};

export default function Layout({
  activePage,
  onNavigate,
  children,
  userEmail,
  onSignOut,
  permissions = [],
}: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNavigate = (page: NavId) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  const sidebarProps = {
    activePage,
    onNavigate: handleNavigate,
    userEmail,
    onSignOut,
    permissions,
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-stone-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-stone-900 text-stone-100 lg:flex">
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* Mobile sidebar drawer */}
      {mobileOpen && (
        <>
          <button
            type="button"
            aria-label="Close navigation menu"
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />

          <aside
            id="mobile-navigation"
            className="fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] flex-col bg-stone-900 text-stone-100 shadow-xl lg:hidden"
          >
            <SidebarContent {...sidebarProps} />
          </aside>
        </>
      )}

      {/* Main area */}
      <div className="flex min-h-screen min-w-0 flex-col lg:ml-64">
        {/* Mobile header */}
        <header className="sticky top-0 z-20 flex min-h-14 items-center justify-between gap-3 bg-stone-900 px-4 py-3 text-stone-100 lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <Coffee className="h-6 w-6 shrink-0 text-amber-500" />
            <span className="truncate text-lg font-semibold">
              Sip &amp; Savor
            </span>
          </div>

          <button
            type="button"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMobileOpen((open) => !open)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </header>

        <main className="min-w-0 w-full flex-1 p-3 sm:p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  activePage,
  onNavigate,
  userEmail,
  onSignOut,
  permissions = [],
}: {
  activePage: NavId;
  onNavigate: (page: NavId) => void;
  userEmail?: string;
  onSignOut?: () => void;
  permissions?: string[];
  permissionLevels?: Record<string, PermissionLevel>;
}) {
  const permissionSet = new Set(permissions);

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    const requiredPermission = NAV_PERMISSION_MAP[item.id];

    return requiredPermission
      ? permissionSet.has(requiredPermission)
      : false;
  });

  return (
    <>
      <div className="border-b border-stone-800 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-700">
            <Coffee className="h-6 w-6 text-stone-900" />
          </div>

          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight">
              Sip &amp; Savor
            </h1>
            <p className="text-xs text-stone-400">Inventory System</p>
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4">
        {visibleNavItems.map((item) => {
          const Icon = ICON_MAP[item.icon];
          const isActive = activePage === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={classNames(
                'flex min-h-11 w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors',
                isActive
                  ? 'bg-amber-500 text-stone-900 shadow-lg shadow-amber-500/20'
                  : 'text-stone-300 hover:bg-stone-800 hover:text-amber-400'
              )}
            >
              {Icon && <Icon className="h-5 w-5 shrink-0" />}
              <span className="min-w-0 break-words">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-stone-800 px-5 py-4 sm:px-6">
        {userEmail && (
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs text-stone-400">
              {userEmail}
            </p>

            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-800 hover:text-red-400"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}

        <p className="text-xs text-stone-500">
          Inventory &amp; Expense Tracker
        </p>
      </div>
    </>
  );
}
