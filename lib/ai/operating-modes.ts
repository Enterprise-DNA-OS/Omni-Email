/**
 * Personal Operating Modes (Feature 5.x / Tier 5)
 *
 * Defines the available operating modes and their behavior overrides.
 * Modes are stored in user_preferences.operating_mode and user_preferences.mode_config.
 * The mode system changes how the AI pipeline classifies, prioritises, and
 * surfaces email — no code changes are needed to switch modes at runtime.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OperatingMode =
  | "default"
  | "ceo"
  | "assistant"
  | "sales"
  | "support"
  | "travel"
  | "deep_work";

export interface ModeConfig {
  /** AI confidence threshold above which threads are auto-archived (0–1). */
  autoArchiveThreshold?: number;
  /** When true, only threads requiring a decision are surfaced in the inbox. */
  surfaceOnlyDecisions?: boolean;
  /** Maximum number of items shown in the inbox view before pagination. */
  maxInboxItems?: number;
  /** When true, the AI generates drafts for every inbound thread automatically. */
  autoDraftAll?: boolean;
  /** When true, aggressive cleanup rules are applied to low-signal threads. */
  aggressiveCleanup?: boolean;
  /** Categories of thread that are surfaced with elevated prominence. */
  prioritizeCategories?: string[];
  /** How aggressively follow-up reminders are generated: 'low' | 'medium' | 'high'. */
  followUpAggressiveness?: "low" | "medium" | "high";
  /** When true, SLA tracking is enabled for support threads. */
  trackSLA?: boolean;
  /** When true, an auto-reply is sent for non-urgent threads while in this mode. */
  autoReplyNonUrgent?: boolean;
  /** When true, logistics-related emails (flights, hotels, etc.) are highlighted. */
  highlightLogistics?: boolean;
  /** Categories that can interrupt the user; all others are batched. */
  onlyInterruptFor?: string[];
  /** How long to batch non-interrupting threads before surfacing them. e.g. '4h'. */
  batchReviewInterval?: string;
}

export interface OperatingModeDefinition {
  /** Human-readable label. */
  label: string;
  /** Short description shown in mode selection UI. */
  description: string;
  /** Default behaviour overrides for this mode. */
  defaults: ModeConfig;
}

// ---------------------------------------------------------------------------
// Mode definitions
// ---------------------------------------------------------------------------

export const OPERATING_MODES: Record<OperatingMode, OperatingModeDefinition> = {
  default: {
    label: "Default",
    description: "Standard inbox behaviour with no special filters or automation.",
    defaults: {},
  },
  ceo: {
    label: "CEO",
    description: "Only surface decisions. Everything else is handled automatically.",
    defaults: {
      autoArchiveThreshold: 0.6,
      surfaceOnlyDecisions: true,
      maxInboxItems: 10,
    },
  },
  assistant: {
    label: "Assistant",
    description: "Draft replies for every thread and clean up aggressively.",
    defaults: {
      autoArchiveThreshold: 0.5,
      autoDraftAll: true,
      aggressiveCleanup: true,
    },
  },
  sales: {
    label: "Sales",
    description: "Prioritise client and billing threads. Follow up aggressively.",
    defaults: {
      prioritizeCategories: ["client", "billing"],
      followUpAggressiveness: "high",
    },
  },
  support: {
    label: "Support",
    description: "Prioritise support threads and track SLA.",
    defaults: {
      prioritizeCategories: ["support"],
      trackSLA: true,
    },
  },
  travel: {
    label: "Travel",
    description: "Auto-reply to non-urgent mail and highlight logistics emails.",
    defaults: {
      autoReplyNonUrgent: true,
      highlightLogistics: true,
    },
  },
  deep_work: {
    label: "Deep Work",
    description: "Only interrupt for urgent mail. Batch everything else every 4 hours.",
    defaults: {
      onlyInterruptFor: ["urgent"],
      batchReviewInterval: "4h",
    },
  },
};

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Return the effective ModeConfig for a given mode.
 * If the caller passes a per-user override config, it is merged on top of
 * the mode defaults so per-user customisation is preserved.
 */
export function getModeOverrides(
  mode: OperatingMode,
  userConfig?: Partial<ModeConfig>,
): ModeConfig {
  const definition = OPERATING_MODES[mode];
  if (!definition) {
    return userConfig ?? {};
  }
  return { ...definition.defaults, ...(userConfig ?? {}) };
}

/**
 * Type-guard: return true if the string is a valid OperatingMode.
 */
export function isValidMode(mode: string): mode is OperatingMode {
  return Object.keys(OPERATING_MODES).includes(mode);
}
