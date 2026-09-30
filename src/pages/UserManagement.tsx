import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type PermissionLevel = 'none' | 'enter' | 'view' | 'manage';

type UserPermission = {
  permission_code: string;
  permission_level: PermissionLevel;
};

type ManagedUser = {
  id: string;
  email: string | null;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  role: string | null;
  permissions: UserPermission[];
  is_active: boolean;
};

type Role =
  | 'admin'
  | 'hr'
  | 'inventory_officer'
  | 'production_officer';

type PermissionDefinition = {
  code: string;
  label: string;
  description: string;
};

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  hr: 'HR',
  inventory_officer: 'Inventory Officer',
  production_officer: 'Production Officer',
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Full system access, including financial information and user management.',
  hr: 'Operational access without transaction history or cumulative financial information.',
  inventory_officer: 'Raw materials and stock-in operational access.',
  production_officer: 'Products, recipes and production operational access.',
};

const PERMISSION_GROUPS: {
  module: string;
  label: string;
  permissions: PermissionDefinition[];
}[] = [
  {
    module: 'dashboard',
    label: 'Dashboard',
    permissions: [
      {
        code: 'dashboard.view',
        label: 'View dashboard',
        description: 'Access the main dashboard.',
      },
      {
        code: 'dashboard.view_financials',
        label: 'View financial dashboard',
        description: 'See financial KPIs and cumulative financial information.',
      },
      {
        code: 'dashboard.view_operational',
        label: 'View operational dashboard',
        description: 'See non-financial operational KPIs.',
      },
    ],
  },
  {
    module: 'raw_materials',
    label: 'Raw Materials',
    permissions: [
      {
        code: 'raw_materials.view',
        label: 'View raw materials',
        description: 'Browse raw material records.',
      },
      {
        code: 'raw_materials.create',
        label: 'Create raw materials',
        description: 'Add raw material records.',
      },
      {
        code: 'raw_materials.edit',
        label: 'Edit raw materials',
        description: 'Modify raw material records.',
      },
      {
        code: 'raw_materials.delete',
        label: 'Delete raw materials',
        description: 'Delete raw material records.',
      },
      {
        code: 'raw_materials.stock_adjust',
        label: 'Adjust stock',
        description: 'Perform stock adjustments.',
      },
      {
        code: 'raw_materials.view_history',
        label: 'View transaction history',
        description: 'View raw material transaction history.',
      },
      {
        code: 'raw_materials.view_cost',
        label: 'View costs',
        description: 'View raw material costs.',
      },
    ],
  },
  {
    module: 'stock_in',
    label: 'Stock In',
    permissions: [
      {
        code: 'stock_in.create',
        label: 'Enter stock',
        description: 'Record stock-in transactions.',
      },
      {
        code: 'stock_in.view_history',
        label: 'View stock-in history',
        description: 'Browse stock-in transaction history.',
      },
      {
        code: 'stock_in.edit',
        label: 'Edit stock-in',
        description: 'Edit stock-in transactions.',
      },
      {
        code: 'stock_in.void',
        label: 'Void stock-in',
        description: 'Void stock-in transactions.',
      },
      {
        code: 'stock_in.view_cost',
        label: 'View stock-in costs',
        description: 'View financial values on stock-in records.',
      },
    ],
  },
  {
    module: 'products',
    label: 'Products',
    permissions: [
      {
        code: 'products.view',
        label: 'View products',
        description: 'Browse products.',
      },
      {
        code: 'products.create',
        label: 'Create products',
        description: 'Add products.',
      },
      {
        code: 'products.edit',
        label: 'Edit products',
        description: 'Modify products.',
      },
      {
        code: 'products.delete',
        label: 'Delete products',
        description: 'Delete products.',
      },
      {
        code: 'products.view_price',
        label: 'View prices',
        description: 'View product selling prices.',
      },
    ],
  },
  {
    module: 'recipes',
    label: 'Recipes',
    permissions: [
      {
        code: 'recipes.view',
        label: 'View recipes',
        description: 'Browse recipes.',
      },
      {
        code: 'recipes.create',
        label: 'Create recipes',
        description: 'Create recipes.',
      },
      {
        code: 'recipes.edit',
        label: 'Edit recipes',
        description: 'Modify recipes.',
      },
      {
        code: 'recipes.delete',
        label: 'Delete recipes',
        description: 'Delete recipes.',
      },
      {
        code: 'recipes.view_cost',
        label: 'View recipe costs',
        description: 'View recipe costing information.',
      },
    ],
  },
  {
    module: 'production',
    label: 'Production',
    permissions: [
      {
        code: 'production.create',
        label: 'Enter production',
        description: 'Record production.',
      },
      {
        code: 'production.view_history',
        label: 'View production history',
        description: 'Browse production history.',
      },
      {
        code: 'production.edit',
        label: 'Edit production',
        description: 'Edit production records.',
      },
      {
        code: 'production.reverse',
        label: 'Reverse production',
        description: 'Reverse production transactions.',
      },
      {
        code: 'production.view_cost',
        label: 'View production costs',
        description: 'View production costing information.',
      },
    ],
  },
  {
    module: 'sales',
    label: 'Sales',
    permissions: [
      {
        code: 'sales.create',
        label: 'Enter sales',
        description: 'Create sales invoices.',
      },
      {
        code: 'sales.view_history',
        label: 'View sales history',
        description: 'Browse historical sales transactions.',
      },
      {
        code: 'sales.edit',
        label: 'Edit sales',
        description: 'Edit sales transactions.',
      },
      {
        code: 'sales.void',
        label: 'Void sales',
        description: 'Void sales transactions.',
      },
      {
        code: 'sales.print_receipt',
        label: 'Print receipts',
        description: 'Print customer receipts.',
      },
      {
        code: 'sales.view_prices',
        label: 'View sales prices',
        description: 'View selling prices.',
      },
      {
        code: 'sales.view_cogs',
        label: 'View COGS',
        description: 'View cost of goods sold.',
      },
      {
        code: 'sales.view_profit',
        label: 'View profit',
        description: 'View sales profitability.',
      },
    ],
  },
  {
    module: 'customers',
    label: 'Customers',
    permissions: [
      {
        code: 'customers.view',
        label: 'View customers',
        description: 'View customer information.',
      },
      {
        code: 'customers.create',
        label: 'Create customers',
        description: 'Add customers.',
      },
      {
        code: 'customers.edit',
        label: 'Edit customers',
        description: 'Edit customer information.',
      },
      {
        code: 'customers.delete',
        label: 'Delete customers',
        description: 'Delete customers.',
      },
      {
        code: 'customers.view_balance',
        label: 'View customer balances',
        description: 'View outstanding customer balances.',
      },
      {
        code: 'customers.view_transactions',
        label: 'View customer transactions',
        description: 'View customer transaction history and statements.',
      },
    ],
  },
  {
    module: 'payments',
    label: 'Payments',
    permissions: [
      {
        code: 'payments.create',
        label: 'Enter payments',
        description: 'Record customer payments.',
      },
      {
        code: 'payments.view_history',
        label: 'View payment history',
        description: 'Browse payment history.',
      },
      {
        code: 'payments.edit',
        label: 'Edit payments',
        description: 'Edit payment records.',
      },
      {
        code: 'payments.void',
        label: 'Void payments',
        description: 'Void payment records.',
      },
      {
        code: 'payments.view_amounts',
        label: 'View payment amounts',
        description: 'View financial amounts on payments.',
      },
    ],
  },
  {
    module: 'deliveries',
    label: 'Deliveries',
    permissions: [
      {
        code: 'deliveries.view',
        label: 'View deliveries',
        description: 'Browse deliveries.',
      },
      {
        code: 'deliveries.create',
        label: 'Create deliveries',
        description: 'Create delivery records.',
      },
      {
        code: 'deliveries.edit',
        label: 'Edit deliveries',
        description: 'Edit delivery records.',
      },
      {
        code: 'deliveries.update_status',
        label: 'Update delivery status',
        description: 'Update delivery status.',
      },
      {
        code: 'deliveries.delete',
        label: 'Delete deliveries',
        description: 'Delete delivery records.',
      },
      {
        code: 'deliveries.view_cost',
        label: 'View delivery costs',
        description: 'View delivery costs.',
      },
      {
        code: 'deliveries.view_margin',
        label: 'View delivery margin',
        description: 'View delivery margin.',
      },
    ],
  },
  {
    module: 'expenses',
    label: 'Expenses',
    permissions: [
      {
        code: 'expenses.create',
        label: 'Enter expenses',
        description: 'Record expenses.',
      },
      {
        code: 'expenses.view_history',
        label: 'View expense history',
        description: 'Browse expense history.',
      },
      {
        code: 'expenses.edit',
        label: 'Edit expenses',
        description: 'Edit expense records.',
      },
      {
        code: 'expenses.void',
        label: 'Void expenses',
        description: 'Void expense records.',
      },
      {
        code: 'expenses.view_amounts',
        label: 'View expense amounts',
        description: 'View financial expense amounts.',
      },
    ],
  },
  {
    module: 'reports',
    label: 'Reports',
    permissions: [
      {
        code: 'reports.sales',
        label: 'Sales reports',
        description: 'Access sales reports.',
      },
      {
        code: 'reports.inventory',
        label: 'Inventory reports',
        description: 'Access inventory reports.',
      },
      {
        code: 'reports.production',
        label: 'Production reports',
        description: 'Access production reports.',
      },
      {
        code: 'reports.payments',
        label: 'Payment reports',
        description: 'Access payment reports.',
      },
      {
        code: 'reports.expenses',
        label: 'Expense reports',
        description: 'Access expense reports.',
      },
      {
        code: 'reports.profit',
        label: 'Profit reports',
        description: 'Access profitability reports.',
      },
      {
        code: 'reports.financial',
        label: 'Financial reports',
        description: 'Access financial reports.',
      },
    ],
  },
  {
    module: 'database_export',
    label: 'Database Export',
    permissions: [
      {
        code: 'database_export.view',
        label: 'View database export',
        description: 'Access database export tools.',
      },
      {
        code: 'database_export.export',
        label: 'Export database',
        description: 'Export application data.',
      },
    ],
  },
  {
    module: 'users',
    label: 'User Management',
    permissions: [
      {
        code: 'users.view',
        label: 'View users',
        description: 'View staff accounts.',
      },
      {
        code: 'users.create',
        label: 'Create users',
        description: 'Create staff accounts.',
      },
      {
        code: 'users.edit',
        label: 'Edit users',
        description: 'Edit staff accounts.',
      },
      {
        code: 'users.disable',
        label: 'Disable users',
        description: 'Disable staff accounts.',
      },
      {
        code: 'users.manage_permissions',
        label: 'Manage permissions',
        description: 'Change staff permissions.',
      },
      {
        code: 'users.reset_password',
        label: 'Reset passwords',
        description: 'Reset staff passwords.',
      },
    ],
  },
];

const ALL_PERMISSION_CODES = PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((permission) => permission.code)
);

function buildPermissions(
  values: Record<string, PermissionLevel> = {}
): Record<string, PermissionLevel> {
  return Object.fromEntries(
    ALL_PERMISSION_CODES.map((code) => [
      code,
      values[code] ?? 'none',
    ])
  );
}

const ROLE_TEMPLATES: Record<
  Role,
  Record<string, PermissionLevel>
> = {
  admin: Object.fromEntries(
    ALL_PERMISSION_CODES.map((code) => [code, 'manage'])
  ),

  hr: {
    'dashboard.view': 'view',
    'dashboard.view_operational': 'view',

    'raw_materials.view': 'view',
    'raw_materials.create': 'enter',
    'raw_materials.edit': 'enter',
    'raw_materials.stock_adjust': 'enter',

    'stock_in.create': 'enter',

    'products.view': 'view',
    'recipes.view': 'view',

    'production.create': 'enter',

    'sales.create': 'enter',
    'sales.print_receipt': 'enter',

    'customers.view': 'view',
    'customers.create': 'enter',
    'customers.edit': 'enter',
    'customers.view_balance': 'view',

    'payments.create': 'enter',

    'expenses.create': 'enter',
  },

  inventory_officer: {
    'dashboard.view': 'view',
    'dashboard.view_operational': 'view',

    'raw_materials.view': 'view',
    'raw_materials.create': 'enter',
    'raw_materials.edit': 'enter',
    'raw_materials.stock_adjust': 'enter',

    'stock_in.create': 'enter',
    'products.view': 'view',
  },

  production_officer: {
    'dashboard.view': 'view',
    'dashboard.view_operational': 'view',

    'products.view': 'view',
    'products.create': 'enter',
    'products.edit': 'enter',

    'recipes.view': 'view',
    'recipes.create': 'enter',
    'recipes.edit': 'enter',

    'production.create': 'enter',
  },
};

function getRoleLabel(role: string | null) {
  if (!role) return 'No role assigned';

  return ROLE_LABELS[role as Role] ?? role;
}

function formatDate(value: string | null) {
  if (!value) return 'Never';

  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function emptyPermissions() {
  return buildPermissions();
}

function templatePermissions(role: Role) {
  return buildPermissions(ROLE_TEMPLATES[role]);
}

export default function UserManagement() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editRole, setEditRole] = useState<Role>('hr');
  const [editPermissions, setEditPermissions] =
    useState<Record<string, PermissionLevel>>(emptyPermissions());
  const [editOpenModules, setEditOpenModules] =
    useState<Record<string, boolean>>({
      dashboard: true,
      raw_materials: false,
      stock_in: false,
      products: false,
      recipes: false,
      production: false,
      sales: false,
      customers: false,
      payments: false,
      deliveries: false,
      expenses: false,
      reports: false,
      database_export: false,
      users: false,
    });
  const [editActive, setEditActive] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<Role>('hr');
  const [permissions, setPermissions] =
    useState<Record<string, PermissionLevel>>(
      templatePermissions('hr')
    );

  const [openModules, setOpenModules] = useState<
    Record<string, boolean>
  >({
    dashboard: true,
    raw_materials: false,
    stock_in: false,
    products: false,
    recipes: false,
    production: false,
    sales: false,
    customers: false,
    payments: false,
    deliveries: false,
    expenses: false,
    reports: false,
    database_export: false,
    users: false,
  });

  const loadUsers = useCallback(async () => {
    setError(null);

    try {
      const { data, error: functionError } =
        await supabase.functions.invoke('manage-user', {
          body: {
            action: 'list',
          },
        });

      if (functionError) {
        throw new Error(functionError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setUsers(data?.users ?? []);
    } catch (err) {
      console.error('Failed to load users:', err);

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load users'
      );
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function initialLoad() {
      setLoading(true);

      try {
        await loadUsers();
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    initialLoad();

    return () => {
      mounted = false;
    };
  }, [loadUsers]);

  const activeUsers = useMemo(
    () => users.filter((user) => user.is_active).length,
    [users]
  );

  const disabledUsers = users.length - activeUsers;

  const resetCreateForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setRole('hr');
    setPermissions(templatePermissions('hr'));
    setCreateError(null);
    setCreateSuccess(null);
  };

  const openCreateModal = () => {
    resetCreateForm();
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    if (creating) return;

    setShowCreateModal(false);
    resetCreateForm();
  };

  const applyRoleTemplate = (selectedRole: Role) => {
    setRole(selectedRole);
    setPermissions(templatePermissions(selectedRole));
  };

  const setPermissionLevel = (
    permissionCode: string,
    level: PermissionLevel
  ) => {
    setPermissions((current) => ({
      ...current,
      [permissionCode]: level,
    }));
  };

  const toggleModule = (module: string) => {
    setOpenModules((current) => ({
      ...current,
      [module]: !current[module],
    }));
  };
  const setEditPermissionLevel = (
    permissionCode: string,
    level: PermissionLevel
  ) => {
    setEditPermissions((current) => ({
      ...current,
      [permissionCode]: level,
    }));
  };

  const toggleEditModule = (module: string) => {
    setEditOpenModules((current) => ({
      ...current,
      [module]: !current[module],
    }));
  };

  const handleCreateUser = async () => {
    setCreateError(null);
    setCreateSuccess(null);

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setCreateError('Email address is required.');
      return;
    }

    if (!normalizedEmail.includes('@')) {
      setCreateError('Please enter a valid email address.');
      return;
    }

    if (password.length < 8) {
      setCreateError(
        'Password must contain at least 8 characters.'
      );
      return;
    }

    if (password !== confirmPassword) {
      setCreateError('Passwords do not match.');
      return;
    }

    const permissionRows = Object.entries(permissions)
      .filter(([, level]) => level !== 'none')
      .map(([permission_code, permission_level]) => ({
        permission_code,
        permission_level,
      }));

    setCreating(true);

    try {
      const { data, error: functionError } =
        await supabase.functions.invoke('manage-user', {
          body: {
            action: 'create',
            email: normalizedEmail,
            password,
            role,
            permissions: permissionRows,
          },
        });

      if (functionError) {
        throw new Error(functionError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setCreateSuccess(
        `${normalizedEmail} was created successfully.`
      );

      setPassword('');
      setConfirmPassword('');

      await loadUsers();

      window.setTimeout(() => {
        setShowCreateModal(false);
        resetCreateForm();
      }, 900);
    } catch (err) {
      console.error('Failed to create user:', err);

      setCreateError(
        err instanceof Error
          ? err.message
          : 'Unable to create user.'
      );
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (user: ManagedUser) => {
    const knownRole = user.role &&
      Object.prototype.hasOwnProperty.call(ROLE_LABELS, user.role)
      ? user.role as Role
      : 'hr';

    const userPermissionValues = Object.fromEntries(
      user.permissions.map((permission) => [
        permission.permission_code,
        permission.permission_level,
      ])
    ) as Record<string, PermissionLevel>;

    setEditingUser(user);
    setEditRole(knownRole);
    setEditPermissions(buildPermissions(userPermissionValues));
    setEditActive(user.is_active);
    setEditError(null);
    setEditSuccess(null);
    setEditOpenModules({
      dashboard: true,
      raw_materials: false,
      stock_in: false,
      products: false,
      recipes: false,
      production: false,
      sales: false,
      customers: false,
      payments: false,
      deliveries: false,
      expenses: false,
      reports: false,
      database_export: false,
      users: false,
    });
  };

  const closeEditModal = () => {
    if (editing) return;

    setEditingUser(null);
    setEditError(null);
    setEditSuccess(null);
  };

  const handleEditUser = async () => {
    if (!editingUser) return;

    setEditing(true);
    setEditError(null);
    setEditSuccess(null);

    try {
      const permissionRows = Object.entries(editPermissions)
        .filter(([, level]) => level !== 'none')
        .map(([permission_code, permission_level]) => ({
          permission_code,
          permission_level,
        }));

      const { data: updateData, error: updateFunctionError } =
        await supabase.functions.invoke('manage-user', {
          body: {
            action: 'update',
            user_id: editingUser.id,
            role: editRole,
            permissions: permissionRows,
          },
        });

      if (updateFunctionError) {
        throw new Error(updateFunctionError.message);
      }

      if (updateData?.error) {
        throw new Error(updateData.error);
      }

      if (editActive !== editingUser.is_active) {
        const action = editActive ? 'enable' : 'disable';

        const { data: statusData, error: statusFunctionError } =
          await supabase.functions.invoke('manage-user', {
            body: {
              action,
              user_id: editingUser.id,
            },
          });

        if (statusFunctionError) {
          throw new Error(statusFunctionError.message);
        }

        if (statusData?.error) {
          throw new Error(statusData.error);
        }
      }

      setEditSuccess(
        `${editingUser.email ?? 'User'} updated successfully.`
      );

      await loadUsers();

      window.setTimeout(() => {
        setEditingUser(null);
        setEditSuccess(null);
      }, 900);
    } catch (err) {
      console.error('Failed to update user:', err);

      setEditError(
        err instanceof Error
          ? err.message
          : 'Unable to update user.'
      );
    } finally {
      setEditing(false);
    }
  };
  const handleRefresh = async () => {
    setRefreshing(true);

    try {
      await loadUsers();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-amber-600" />
          <div>
            <h1 className="text-2xl font-bold text-stone-900">
              User Management
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Loading users...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-900 text-white">
            <Users size={20} />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-stone-900">
              User Management
            </h1>

            <p className="mt-1 text-sm text-stone-500">
              Manage staff accounts, roles and permissions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={refreshing ? 'animate-spin' : ''}
            />
            Refresh
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
          >
            <UserPlus size={16} />
            Add User
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="font-semibold text-red-800">
            Unable to load users
          </p>

          <p className="mt-1 text-sm text-red-700">
            {error}
          </p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-500">Total users</p>
          <p className="mt-1 text-2xl font-bold text-stone-900">
            {users.length}
          </p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-500">Active users</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">
            {activeUsers}
          </p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-500">Disabled users</p>
          <p className="mt-1 text-2xl font-bold text-stone-600">
            {disabledUsers}
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="border-b border-stone-200 px-5 py-4">
          <h2 className="font-semibold text-stone-900">
            Staff Accounts
          </h2>

          <p className="mt-1 text-sm text-stone-500">
            Only administrators can manage staff accounts.
          </p>
        </div>

        {users.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Users
              size={32}
              className="mx-auto text-stone-300"
            />

            <p className="mt-3 font-medium text-stone-700">
              No users found
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-left">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    User
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Role
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Status
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Last Sign-in
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Created
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-stone-100">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-stone-50"
                  >
                    <td className="px-5 py-4">
                      <div className="font-medium text-stone-900">
                        {user.email ?? '(no email)'}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
                        {getRoleLabel(user.role)}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={
                          user.is_active
                            ? 'inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700'
                            : 'inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500'
                        }
                      >
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-sm text-stone-600">
                      {formatDate(user.last_sign_in_at)}
                    </td>

                    <td className="px-5 py-4 text-sm text-stone-600">
                      {formatDate(user.created_at)}
                    </td>

                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => openEditModal(user)}
                        className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
              <div>
                <h2 className="text-xl font-bold text-stone-900">
                  Edit Staff Account
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  {editingUser.email ?? '(no email)'}
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditModal}
                disabled={editing}
                className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto p-6">
              {editError && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="font-semibold text-red-800">
                    Update failed
                  </p>
                  <p className="mt-1 text-sm text-red-700">
                    {editError}
                  </p>
                </div>
              )}

              {editSuccess && (
                <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="font-semibold text-emerald-800">
                    {editSuccess}
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-stone-200 p-4">
                <p className="text-sm font-semibold text-stone-900">
                  Role
                </p>

                <p className="mt-1 text-sm text-stone-500">
                  Changing the role applies only the role value. Individual permissions can be adjusted below.
                </p>

                <select
                  value={editRole}
                  onChange={(event) => {
                    const selectedRole = event.target.value as Role;
                    setEditRole(selectedRole);
                    setEditPermissions(templatePermissions(selectedRole));
                  }}
                  disabled={editing}
                  className="mt-4 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                >
                  {(Object.keys(ROLE_LABELS) as Role[]).map((availableRole) => (
                    <option key={availableRole} value={availableRole}>
                      {ROLE_LABELS[availableRole]}
                    </option>
                  ))}
                </select>

                <p className="mt-2 text-xs text-stone-500">
                  Selecting a role loads its standard permission template. You can customize it below.
                </p>
              </div>

              <div className="mt-5 rounded-xl border border-stone-200">
                <div className="border-b border-stone-200 px-5 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-stone-900">
                        Custom Permissions
                      </h3>
                      <p className="mt-1 text-sm text-stone-500">
                        Adjust individual permissions for this staff account.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEditPermissions(templatePermissions(editRole))}
                      disabled={editing}
                      className="shrink-0 rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                    >
                      Reset to {ROLE_LABELS[editRole]}
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-stone-200">
                  {PERMISSION_GROUPS.map((group) => {
                    const enabledCount = group.permissions.filter(
                      (permission) =>
                        editPermissions[permission.code] !== 'none'
                    ).length;

                    return (
                      <div key={group.module}>
                        <button
                          type="button"
                          onClick={() => toggleEditModule(group.module)}
                          disabled={editing}
                          className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-stone-50 disabled:cursor-not-allowed"
                        >
                          <div>
                            <p className="font-medium text-stone-900">
                              {group.label}
                            </p>
                            <p className="mt-0.5 text-xs text-stone-500">
                              {enabledCount} of {group.permissions.length} permissions enabled
                            </p>
                          </div>

                          <ChevronDown
                            size={18}
                            className={`transition-transform ${
                              editOpenModules[group.module]
                                ? 'rotate-180'
                                : ''
                            }`}
                          />
                        </button>

                        {editOpenModules[group.module] && (
                          <div className="bg-stone-50 px-5 pb-5">
                            <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
                              <table className="min-w-full">
                                <thead>
                                  <tr className="border-b border-stone-200 bg-stone-50">
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                                      Permission
                                    </th>
                                    <th className="w-40 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                                      Level
                                    </th>
                                  </tr>
                                </thead>

                                <tbody className="divide-y divide-stone-100">
                                  {group.permissions.map((permission) => (
                                    <tr key={permission.code}>
                                      <td className="px-4 py-3">
                                        <p className="text-sm font-medium text-stone-800">
                                          {permission.label}
                                        </p>
                                        <p className="mt-0.5 text-xs text-stone-500">
                                          {permission.description}
                                        </p>
                                      </td>

                                      <td className="px-4 py-3">
                                        <select
                                          value={
                                            editPermissions[permission.code] ??
                                            'none'
                                          }
                                          onChange={(event) =>
                                            setEditPermissionLevel(
                                              permission.code,
                                              event.target.value as PermissionLevel
                                            )
                                          }
                                          disabled={editing}
                                          className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                                        >
                                          <option value="none">None</option>
                                          <option value="enter">Enter</option>
                                          <option value="view">View</option>
                                          <option value="manage">Manage</option>
                                        </select>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-stone-200 p-4">
                <p className="text-sm font-semibold text-stone-900">
                  Account Status
                </p>

                <p className="mt-1 text-sm text-stone-500">
                  Inactive staff cannot sign in to the application.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditActive(true)}
                    disabled={editing}
                    className={
                      editActive
                        ? 'rounded-xl border-2 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700'
                        : 'rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-600 hover:bg-stone-50'
                    }
                  >
                    Active
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditActive(false)}
                    disabled={editing}
                    className={
                      !editActive
                        ? 'rounded-xl border-2 border-stone-500 bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-700'
                        : 'rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-600 hover:bg-stone-50'
                    }
                  >
                    Inactive
                  </button>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={editing}
                  className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleEditUser}
                  disabled={editing}
                  className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {editing ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-900 text-white">
                  <UserPlus size={20} />
                </div>

                <div>
                  <h2 className="text-xl font-bold text-stone-900">
                    Create Staff User
                  </h2>

                  <p className="text-sm text-stone-500">
                    Create the account and assign its initial permissions.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeCreateModal}
                disabled={creating}
                className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto p-6">
              {createError && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="font-semibold text-red-800">
                    User creation failed
                  </p>
                  <p className="mt-1 text-sm text-red-700">
                    {createError}
                  </p>
                </div>
              )}

              {createSuccess && (
                <div className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <CheckCircle2
                    size={20}
                    className="text-emerald-600"
                  />
                  <p className="text-sm font-medium text-emerald-800">
                    {createSuccess}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-stone-200 p-5">
                  <h3 className="font-semibold text-stone-900">
                    Account Details
                  </h3>

                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-stone-700">
                        Email address
                      </label>

                      <input
                        type="email"
                        value={email}
                        onChange={(event) =>
                          setEmail(event.target.value)
                        }
                        placeholder="staff@example.com"
                        disabled={creating}
                        className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:bg-stone-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-stone-700">
                        Temporary password
                      </label>

                      <input
                        type="password"
                        value={password}
                        onChange={(event) =>
                          setPassword(event.target.value)
                        }
                        placeholder="At least 8 characters"
                        disabled={creating}
                        className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:bg-stone-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-stone-700">
                        Confirm password
                      </label>

                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        placeholder="Repeat the password"
                        disabled={creating}
                        className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:bg-stone-100"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-stone-200 p-5">
                  <div className="flex items-center gap-2">
                    <Shield size={18} className="text-stone-700" />
                    <h3 className="font-semibold text-stone-900">
                      Role Template
                    </h3>
                  </div>

                  <div className="mt-4 space-y-2">
                    {(Object.keys(ROLE_LABELS) as Role[]).map(
                      (availableRole) => (
                        <label
                          key={availableRole}
                          className={`block cursor-pointer rounded-xl border p-4 transition ${
                            role === availableRole
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-stone-200 hover:bg-stone-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="radio"
                              name="role"
                              value={availableRole}
                              checked={role === availableRole}
                              onChange={() =>
                                applyRoleTemplate(
                                  availableRole
                                )
                              }
                              disabled={creating}
                              className="mt-1"
                            />

                            <div>
                              <p className="font-semibold text-stone-900">
                                {ROLE_LABELS[availableRole]}
                              </p>

                              <p className="mt-1 text-sm text-stone-500">
                                {ROLE_DESCRIPTIONS[availableRole]}
                              </p>
                            </div>
                          </div>
                        </label>
                      )
                    )}
                  </div>

                  <p className="mt-4 rounded-lg bg-stone-50 p-3 text-xs text-stone-500">
                    Selecting a role applies its standard permission
                    template. You can customize the permissions below
                    before creating the user.
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-stone-200">
                <div className="border-b border-stone-200 px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-stone-900">
                        Custom Permissions
                      </h3>

                      <p className="mt-1 text-sm text-stone-500">
                        Adjust the selected role's permissions before
                        creating the account.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setPermissions(
                          templatePermissions(role)
                        )
                      }
                      disabled={creating}
                      className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                    >
                      Reset to {ROLE_LABELS[role]}
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-stone-200">
                  {PERMISSION_GROUPS.map((group) => {
                    const enabledCount =
                      group.permissions.filter(
                        (permission) =>
                          permissions[permission.code] !== 'none'
                      ).length;

                    return (
                      <div key={group.module}>
                        <button
                          type="button"
                          onClick={() =>
                            toggleModule(group.module)
                          }
                          className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-stone-50"
                        >
                          <div className="flex items-center gap-3">
                            <ChevronDown
                              size={18}
                              className={`transition-transform ${
                                openModules[group.module]
                                  ? 'rotate-180'
                                  : ''
                              }`}
                            />

                            <div>
                              <p className="font-medium text-stone-900">
                                {group.label}
                              </p>

                              <p className="text-xs text-stone-500">
                                {enabledCount} of{' '}
                                {group.permissions.length}{' '}
                                permissions enabled
                              </p>
                            </div>
                          </div>
                        </button>

                        {openModules[group.module] && (
                          <div className="bg-stone-50 px-5 pb-5">
                            <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
                              <table className="min-w-full">
                                <thead>
                                  <tr className="border-b border-stone-200 bg-stone-50">
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                                      Permission
                                    </th>

                                    <th className="w-40 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                                      Level
                                    </th>
                                  </tr>
                                </thead>

                                <tbody className="divide-y divide-stone-100">
                                  {group.permissions.map(
                                    (permission) => (
                                      <tr
                                        key={
                                          permission.code
                                        }
                                      >
                                        <td className="px-4 py-3">
                                          <p className="text-sm font-medium text-stone-800">
                                            {permission.label}
                                          </p>

                                          <p className="mt-0.5 text-xs text-stone-500">
                                            {
                                              permission.description
                                            }
                                          </p>
                                        </td>

                                        <td className="px-4 py-3">
                                          <select
                                            value={
                                              permissions[
                                                permission.code
                                              ] ?? 'none'
                                            }
                                            onChange={(
                                              event
                                            ) =>
                                              setPermissionLevel(
                                                permission.code,
                                                event.target
                                                  .value as PermissionLevel
                                              )
                                            }
                                            disabled={creating}
                                            className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                                          >
                                            <option value="none">
                                              None
                                            </option>
                                            <option value="enter">
                                              Enter
                                            </option>
                                            <option value="view">
                                              View
                                            </option>
                                            <option value="manage">
                                              Manage
                                            </option>
                                          </select>
                                        </td>
                                      </tr>
                                    )
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-stone-200 bg-stone-50 px-6 py-4">
              <button
                type="button"
                onClick={closeCreateModal}
                disabled={creating}
                className="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleCreateUser}
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? (
                  <>
                    <Loader2
                      size={16}
                      className="animate-spin"
                    />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    Create User
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}













