/** Owner-confirmed values (SPEC §2, §17). Stored as integer centavos. */
export const STAKE_MINOR = 1000; // PHP 10
export const GROSS_PAYOUT_MINOR = 310000; // PHP 3,100 total INCLUDING the stake
export const NET_GAIN_MINOR = GROSS_PAYOUT_MINOR - STAKE_MINOR; // PHP 3,090
export const COMBINATION_CAP_MINOR = 50000; // PHP 500 per unordered combination per draw
export const DEFAULT_RESERVATION_MINUTES = 5; // proposed demo default, not owner-confirmed

export const MATCHING_DEFINITION =
  'Win when all three selected distinct digits appear anywhere in the six-digit result. Order, position and adjacency do not matter.';
export const CUTOFF_POLICY =
  'Entries and demo payments accepted only while server time < submission cutoff. Approval requires a ledger receipt before the submission cutoff and server time < verification cutoff. Unapproved entries expire at verification cutoff.';

/** Stake tiers shown in the UI. Only PHP 10 is authorized. */
export const STAKE_OPTIONS = [
  { minor: 1000, enabled: true },
  { minor: 2000, enabled: false },
  { minor: 5000, enabled: false },
] as const;
