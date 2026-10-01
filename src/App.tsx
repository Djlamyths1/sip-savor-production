import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import Auth from '@/components/Auth';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import RawMaterials from '@/pages/RawMaterials';
import Products from '@/pages/Products';
import Recipes from '@/pages/Recipes';
import Production from '@/pages/Production';
import Sales from '@/pages/Sales';
import Customers from '@/pages/Customers';
import Payments from '@/pages/Payments';
import Deliveries from '@/pages/Deliveries';
import StockIn from '@/pages/StockIn';
import Expenses from '@/pages/Expenses';
import Reports from '@/pages/Reports';
import type { NavId } from '@/lib/constants';
import DatabaseExport from '@/pages/DatabaseExport';
import UserManagement from '@/pages/UserManagement';
import { PermissionProvider } from '@/context/PermissionContext';

type PermissionLevel = 'none' | 'enter' | 'view' | 'manage';

type PermissionRow = {
  permission_code: string;
  permission_level: PermissionLevel;
};

const PAGE_PERMISSION_MAP: Partial<Record<NavId, string>> = {
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
  reports: 'reports.view',
  'user-management': 'users.view',
  'database-export': 'database_export.view',
};

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [page, setPage] = useState<NavId>('dashboard');

  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionLevels, setPermissionLevels] = useState<
    Record<string, PermissionLevel>
  >({});

  const loadPermissions = async () => {
    const { data, error } = await supabase.rpc('get_my_permissions');

    if (error) {
      console.error('Failed to load permissions:', error);
      setPermissions([]);
      setPermissionLevels({});
      return;
    }

    const rows = (data ?? []) as PermissionRow[];

    const levels: Record<string, PermissionLevel> = {};

    for (const item of rows) {
      levels[item.permission_code] = item.permission_level;
    }

    setPermissionLevels(levels);

    // Only treat permissions with an actual access level as enabled.
    setPermissions(
      rows
        .filter((item) => item.permission_level !== 'none')
        .map((item) => item.permission_code)
    );
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);

      if (s) {
        setPermissionsLoading(true);
        await loadPermissions();
        setPermissionsLoading(false);
      } else {
        setPermissions([]);
        setPermissionLevels({});
      }

      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session: Session | null) => {
        (async () => {
          setSession(session);

          if (session) {
            setPermissionsLoading(true);
            await loadPermissions();
            setPermissionsLoading(false);
          } else {
            setPermissions([]);
            setPermissionLevels({});
            setPermissionsLoading(false);
          }
        })();
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const canAccessPage = (targetPage: NavId) => {
    const requiredPermission = PAGE_PERMISSION_MAP[targetPage];

    if (!requiredPermission) {
      return false;
    }

    return permissionLevels[requiredPermission] !== undefined &&
      permissionLevels[requiredPermission] !== 'none';
  };

  const firstAllowedPage = (
    Object.keys(PAGE_PERMISSION_MAP) as NavId[]
  ).find((targetPage) => canAccessPage(targetPage));

  const effectivePage: NavId =
    canAccessPage(page)
      ? page
      : firstAllowedPage || 'dashboard';

  const handleNavigate = (targetPage: NavId) => {
    if (!canAccessPage(targetPage)) {
      return;
    }

    setPage(targetPage);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-stone-700 border-t-amber-500 rounded-lg animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  if (permissionsLoading) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-stone-700 border-t-amber-500 rounded-lg animate-spin" />
      </div>
    );
  }

  return (
    <PermissionProvider permissionLevels={permissionLevels}>
      <Layout
        activePage={effectivePage}
        onNavigate={handleNavigate}
        userEmail={session.user.email}
        onSignOut={handleSignOut}
        permissions={permissions}
        permissionLevels={permissionLevels}
      >
        {effectivePage === 'dashboard' && (
          <Dashboard onNavigate={handleNavigate} />
        )}
        {effectivePage === 'raw-materials' && <RawMaterials />}
        {effectivePage === 'stock-in' && <StockIn />}
        {effectivePage === 'products' && <Products />}
        {effectivePage === 'recipes' && <Recipes />}
        {effectivePage === 'production' && <Production />}
        {effectivePage === 'sales' && <Sales />}
        {effectivePage === 'customers' && <Customers />}
        {effectivePage === 'payments' && <Payments />}
        {effectivePage === 'deliveries' && <Deliveries />}
        {effectivePage === 'expenses' && <Expenses />}
        {effectivePage === 'reports' && <Reports />}
        {effectivePage === 'user-management' && <UserManagement />}
        {effectivePage === 'database-export' && <DatabaseExport />}
      </Layout>
    </PermissionProvider>
  );
}

export default App;