export type PermissionLevel = 'none' | 'enter' | 'view' | 'manage';

const LEVEL_RANK: Record<PermissionLevel, number> = {
  none: 0,
  enter: 1,
  view: 2,
  manage: 3,
};

export type PermissionLevels = Record<string, PermissionLevel>;

export function hasPermission(
  permissionLevels: PermissionLevels,
  permissionCode: string,
  requiredLevel: PermissionLevel = 'view'
): boolean {
  const userLevel = permissionLevels[permissionCode] ?? 'none';

  return LEVEL_RANK[userLevel] >= LEVEL_RANK[requiredLevel];
}

export function canEnter(
  permissionLevels: PermissionLevels,
  permissionCode: string
): boolean {
  return hasPermission(permissionLevels, permissionCode, 'enter');
}

export function canView(
  permissionLevels: PermissionLevels,
  permissionCode: string
): boolean {
  return hasPermission(permissionLevels, permissionCode, 'view');
}

export function canManage(
  permissionLevels: PermissionLevels,
  permissionCode: string
): boolean {
  return hasPermission(permissionLevels, permissionCode, 'manage');
}
