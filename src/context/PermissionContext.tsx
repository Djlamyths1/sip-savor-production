import { createContext, useContext } from 'react';
import {
  hasPermission,
  canEnter,
  canView,
  canManage,
  type PermissionLevels,
  type PermissionLevel,
} from '@/lib/permissions';

interface PermissionContextValue {
  permissionLevels: PermissionLevels;
  hasPermission: (
    permissionCode: string,
    requiredLevel?: PermissionLevel
  ) => boolean;
  canEnter: (permissionCode: string) => boolean;
  canView: (permissionCode: string) => boolean;
  canManage: (permissionCode: string) => boolean;
}

const PermissionContext = createContext<PermissionContextValue | undefined>(
  undefined
);

interface PermissionProviderProps {
  permissionLevels: PermissionLevels;
  children: React.ReactNode;
}

export function PermissionProvider({
  permissionLevels,
  children,
}: PermissionProviderProps) {
  const value: PermissionContextValue = {
    permissionLevels,
    hasPermission: (permissionCode, requiredLevel = 'view') =>
      hasPermission(permissionLevels, permissionCode, requiredLevel),
    canEnter: (permissionCode) =>
      canEnter(permissionLevels, permissionCode),
    canView: (permissionCode) =>
      canView(permissionLevels, permissionCode),
    canManage: (permissionCode) =>
      canManage(permissionLevels, permissionCode),
  };

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions(): PermissionContextValue {
  const context = useContext(PermissionContext);

  if (!context) {
    throw new Error(
      'usePermissions must be used inside a PermissionProvider'
    );
  }

  return context;
}
