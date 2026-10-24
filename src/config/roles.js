export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  ACCOUNTING: 'accounting',
  PRINTER: 'printer',
};

const ALL = Object.values(ROLES);
const FULL = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

// Page / module -> kon kon role access pabe.
// Notun page add korle ekhane ekta line add korlei hobe.
export const PAGE_ACCESS = {
  dashboard: ALL,
  holdings: [...FULL, ROLES.MODERATOR, ROLES.PRINTER],
  'tax-collection': FULL,
  notices: FULL,
  'citizen-certificates': FULL,
  'trade-licenses': FULL,
  'warish-certificates': FULL,
  'agriculture-certificates': FULL,
  'village-info': FULL,
  'mosque-info': FULL,
  settings: FULL,
  users: FULL,
};

export const canAccess = (role, page) => !!PAGE_ACCESS[page]?.includes(role);
