export const ROLES = ["owner", "pharmacist", "cashier"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Single source of truth for what each role may do.
 * Assumptions for a typical Lebanese independent pharmacy:
 * - Owner: everything, including users, restore, MoPH import and profit/cost data.
 * - Pharmacist: runs the pharmacy day to day (stock, returns, discounts, sales reports) but not
 *   user management, restores or cost/profit figures.
 * - Cashier: sells, reprints, links barcodes, sees stock and expiry alerts; no revenue figures.
 */
const MATRIX = {
  "pos.sell": ["owner", "pharmacist", "cashier"],
  "pos.discount": ["owner", "pharmacist"],
  "pos.price_override": ["owner"],
  "sales.view": ["owner", "pharmacist", "cashier"],
  "returns.create": ["owner", "pharmacist"],
  "products.view": ["owner", "pharmacist", "cashier"],
  "products.manage": ["owner", "pharmacist"],
  "products.link_barcode": ["owner", "pharmacist", "cashier"],
  "inventory.view": ["owner", "pharmacist", "cashier"],
  "inventory.receive": ["owner", "pharmacist"],
  "inventory.adjust": ["owner", "pharmacist"],
  "reports.inventory": ["owner", "pharmacist", "cashier"],
  "reports.sales": ["owner", "pharmacist"],
  "reports.profit": ["owner"],
  "settings.exchange_rate": ["owner", "pharmacist"],
  "settings.manage": ["owner"],
  "users.manage": ["owner"],
  "backup.create": ["owner", "pharmacist"],
  "backup.restore": ["owner"],
  "catalog.import": ["owner"],
  "ai.use": ["owner", "pharmacist", "cashier"],
  "ai.logs": ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof MATRIX;

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function hasPermission(role: string | undefined, permission: Permission): boolean {
  if (!isRole(role)) return false;
  return (MATRIX[permission] as readonly Role[]).includes(role);
}

export function permissionsForRole(role: string): Permission[] {
  return (Object.keys(MATRIX) as Permission[]).filter((p) => hasPermission(role, p));
}

export function rolesWithPermission(permission: Permission): Role[] {
  return [...MATRIX[permission]];
}
