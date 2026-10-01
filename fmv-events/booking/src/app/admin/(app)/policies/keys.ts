// Allowed policy keys (mirrors the CHECK constraint on public.policies.key).
export const POLICY_KEYS = ['deposit', 'balance', 'cancellation', 'reschedule', 'weather', 'damage', 'prints', 'travel', 'privacy'] as const;

export const policyKeyLabels: Record<(typeof POLICY_KEYS)[number], string> = {
  deposit: 'Deposit',
  balance: 'Balance',
  cancellation: 'Cancellation',
  reschedule: 'Rescheduling',
  weather: 'Weather',
  damage: 'Damage & rental care',
  prints: 'Prints & deliverables',
  travel: 'Travel',
  privacy: 'Privacy',
};
