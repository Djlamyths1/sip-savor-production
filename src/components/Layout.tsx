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
  UserCog
} from 'lucide-react';
import { NAV_ITEMS, type NavId } from '@/lib/constants';
import { classNames } from '@/lib/utils';

type PermissionLevel = 'none' | 'enter' | 'view' | 'manage';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
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

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex w-64 flex-col bg-stone-900 text-stone-100 fixed inset-y-0 left-0 z-30">
        <SidebarContent
  activePage={activePage}
  onNavigate={handleNavigate}
  userEmail={userEmail}
  onSignOut={onSignOut}
  permissions={permissions}
/>
      </aside>

      {/* Sidebar - Mobile Drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-64 bg-stone-900 text-stone-100 z-50 lg:hidden flex flex-col">
            <SidebarContent
  activePage={activePage}
  onNavigate={handleNavigate}
  userEmail={userEmail}
  onSignOut={onSignOut}
  permissions={permissions}
/>
          </aside>
        </>
      )}

      {/* Main Content */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Mobile Header */}
        <header className="lg:hidden bg-stone-900 text-stone-100 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <Coffee className="w-6 h-6 text-amber-500" />
            <span className="font-semibold text-lg">Sip &amp; Savor</span>
          </div>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-1.5 rounded-lg hover:bg-stone-800 transition-colors"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </header>

        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
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
  'database-export': 'database_export.view',
};
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

    if (!requiredPermission) {
      return false;
    }

    return permissionSet.has(requiredPermission);
  });

  return (
    <>
      <div className="px-6 py-6 border-b border-stone-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center">
            <Coffee className="w-6 h-6 text-stone-900" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Sip &amp; Savor</h1>
            <p className="text-xs text-stone-400">Inventory System</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const Icon = ICON_MAP[item.icon];
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={classNames(
                'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-amber-500 text-stone-900 shadow-lg shadow-amber-500/20'
                  : 'text-stone-300 hover:bg-stone-800 hover:text-amber-400'
              )}
            >
              {Icon && <Icon className="w-5 h-5 flex-shrink-0" />}
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-6 py-4 border-t border-stone-800">
        {userEmail && (
          <div className="flex items-center justify-between mb-3">
            <div className="min-w-0">
              <p className="text-xs text-stone-400 truncate">{userEmail}</p>
            </div>
            <button
              onClick={onSignOut}
              className="p-1.5 rounded-lg text-stone-400 hover:text-red-400 hover:bg-stone-800 transition-colors flex-shrink-0"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
        <p className="text-xs text-stone-500">Inventory &amp; Expense Tracker</p>
      </div>
    </>
  );
}




