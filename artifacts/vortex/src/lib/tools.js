// Single source of truth for the dashboard tool catalogue.
// SecureDashboardApp renders these as cards; AdminPanel grants them per user.
// A type missing here is a type no admin can assign.

export const TOOLS = [
  { type: 'bm_meta_tool',      title: 'BM Meta Tool',                 label: 'BM Meta' },
  { type: 'meta_ads_one_way',  title: 'Meta Ads One Way',             label: 'Meta Ads 1-Way' },
  { type: 'mini_meta_2',       title: 'Mini Meta 2$',                 label: 'Mini Meta 2$' },
  { type: 'cc_from_bm',        title: 'CC FROM BM',                   label: 'CC From BM' },
  { type: 'bm_creator',        title: 'CREATE BM & AD ACC & INFO',    label: 'BM Creator' },
  { type: 'inviter_user_bm',   title: 'Inviter User to BM',           label: 'Inviter User' },
  { type: 'cc_tools',          title: 'Vortex CC Tools',              label: 'CC Tools' },
  { type: 'vortex_meta_tools', title: 'Vortex Meta Tools',            label: 'Meta Tools' },
  { type: 'remove_payment',    title: 'Remove Payment',               label: 'Remove Payment' },
  { type: 'add_funds_meta',    title: 'Add Funds Metagraph',          label: 'Funds Metagraph' },
  { type: 'add_primary_cc',    title: 'Add Primary CC',               label: 'Primary CC' },
  { type: 'switch_bm_old',     title: 'Switch BM to Old',             label: 'Switch BM Old' },
  { type: 'funds',             title: 'PREPAID TOOLS',                label: 'Prepaid' },
  { type: 'ads',               title: 'Ads Creation',                 label: 'Ads' },
  { type: 'cards',             title: 'Add Cards',                    label: 'Cards' },
  { type: 'paypal',            title: 'Add PayPal',                   label: 'PayPal' },
  { type: 'gateway',           title: 'Link PayPal Gateway',          label: 'Gateway' },
  { type: 'iban',              title: 'Add IBAN',                     label: 'IBAN' },
  { type: 'methods',           title: 'Methods',                      label: 'Methods' },
  { type: 'debug',             title: 'Debug Data',                   label: 'Debug' },
  { type: 'generator',         title: 'CC Generator',                 label: 'CC Gen' },
  { type: 'checker',           title: 'CC Checker',                   label: 'CC Check' },
  { type: 'email',             title: 'Email Checker',                label: 'Email' },
  { type: 'social',            title: 'Social Gateway Checker',       label: 'Social' },
  { type: 'proxy',             title: 'Proxy Tools',                  label: 'Proxy' },
  { type: 'support',           title: 'Support Center',               label: 'Support' },
];

export const ALL_TOOL_TYPES = TOOLS.map(t => t.type);

export const TOOL_LABELS = Object.fromEntries(TOOLS.map(t => [t.type, t.label]));

export const PLAN_DEFAULTS = {
  none:       [],
  basic:      ['funds'],
  pro:        ['funds', 'ads', 'support'],
  enterprise: ALL_TOOL_TYPES,
};
