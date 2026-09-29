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

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<NavId>('dashboard');

  // Kept for existing sidebar/navigation logic.
  const [permissions, setPermissions] = useState<string[]>([]);

  // New permission-level map for page/action-level access control.
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

    setPermissions(rows.map((item) => item.permission_code));

    const levels: Record<string, PermissionLevel> = {};

    for (const item of rows) {
      levels[item.permission_code] = item.permission_level;
    }

    setPermissionLevels(levels);
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);

      if (s) {
        await loadPermissions();
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
            await loadPermissions();
          } else {
            setPermissions([]);
            setPermissionLevels({});
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

  return (
    <PermissionProvider permissionLevels={permissionLevels}>
      <Layout
      activePage={page}
      onNavigate={setPage}
      userEmail={session.user.email}
      onSignOut={handleSignOut}
      permissions={permissions}
      permissionLevels={permissionLevels}
    >
      {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
      {page === 'raw-materials' && <RawMaterials />}
      {page === 'stock-in' && <StockIn />}
      {page === 'products' && <Products />}
      {page === 'recipes' && <Recipes />}
      {page === 'production' && <Production />}
      {page === 'sales' && <Sales />}
      {page === 'customers' && <Customers />}
      {page === 'payments' && <Payments />}
      {page === 'deliveries' && <Deliveries />}
      {page === 'expenses' && <Expenses />}
      {page === 'reports' && <Reports />}
      {page === 'user-management' && <UserManagement />}
      {page === 'database-export' && <DatabaseExport />}
      </Layout>
    </PermissionProvider>
  );
}

export default App;





