/**
 * Rules Engine — Condition Evaluators
 *
 * A condition is a single boolean predicate applied to a thread's data.
 * Multiple conditions are chained with logic = "AND" | "OR".
 */

export type ConditionField =
  | "sender_email"
  | "sender_domain"
  | "subject"
  | "body"
  | "ai_category"
  | "ai_priority"
  | "ai_intent"
  | "has_attachments"
  | "is_first_time_sender"
  | "account_id";

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "matches_regex"
  | "in_list";

export type ConditionLogic = "AND" | "OR";

export interface Condition {
  field: ConditionField;
  operator: ConditionOperator;
  value: string | string[] | boolean;
  /** How this condition connects to the NEXT condition in the list. Ignored for the last condition. */
  logic: ConditionLogic;
}

export interface ThreadData {
  senderEmail: string | null;
  senderDomain: string | null;
  subject: string | null;
  body: string | null;
  aiCategory: string | null;
  aiPriority: string | null;
  aiIntent: string | null;
  hasAttachments: boolean;
  isFirstTimeSender: boolean;
  accountId: string | null;
}

// ---------------------------------------------------------------------------
// Field extraction — resolve a raw field value from thread data
// ---------------------------------------------------------------------------

function resolveFieldValue(field: ConditionField, thread: ThreadData): string | boolean | null {
  switch (field) {
    case "sender_email":
      return thread.senderEmail;
    case "sender_domain":
      return thread.senderDomain;
    case "subject":
      return thread.subject;
    case "body":
      return thread.body;
    case "ai_category":
      return thread.aiCategory;
    case "ai_priority":
      return thread.aiPriority;
    case "ai_intent":
      return thread.aiIntent;
    case "has_attachments":
      return thread.hasAttachments;
    case "is_first_time_sender":
      return thread.isFirstTimeSender;
    case "account_id":
      return thread.accountId;
  }
}

// ---------------------------------------------------------------------------
// Operator evaluation
// ---------------------------------------------------------------------------

function applyStringOperator(
  operator: ConditionOperator,
  fieldValue: string,
  conditionValue: string | string[],
): boolean {
  const haystack = fieldValue.toLowerCase();

  switch (operator) {
    case "equals":
      return haystack === String(conditionValue).toLowerCase();

    case "not_equals":
      return haystack !== String(conditionValue).toLowerCase();

    case "contains":
      return haystack.includes(String(conditionValue).toLowerCase());

    case "not_contains":
      return !haystack.includes(String(conditionValue).toLowerCase());

    case "starts_with":
      return haystack.startsWith(String(conditionValue).toLowerCase());

    case "ends_with":
      return haystack.endsWith(String(conditionValue).toLowerCase());

    case "matches_regex": {
      try {
        const re = new RegExp(String(conditionValue), "i");
        return re.test(fieldValue);
      } catch {
        // Invalid regex — never matches rather than throwing
        return false;
      }
    }

    case "in_list": {
      const list = Array.isArray(conditionValue)
        ? conditionValue.map((v) => String(v).toLowerCase())
        : String(conditionValue)
            .split(",")
            .map((v) => v.trim().toLowerCase())
            .filter(Boolean);
      return list.includes(haystack);
    }
  }
}

function applyBooleanOperator(
  operator: ConditionOperator,
  fieldValue: boolean,
  conditionValue: string | string[] | boolean,
): boolean {
  // For boolean fields we only meaningfully support equals / not_equals
  const expected =
    typeof conditionValue === "boolean"
      ? conditionValue
      : String(conditionValue).toLowerCase() === "true";

  switch (operator) {
    case "equals":
      return fieldValue === expected;
    case "not_equals":
      return fieldValue !== expected;
    default:
      // Boolean fields don't support string operators — treat as no-match
      return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a single condition against thread data.
 * Returns true if the condition is satisfied.
 */
export function evaluateCondition(condition: Condition, thread: ThreadData): boolean {
  const raw = resolveFieldValue(condition.field, thread);

  // Boolean fields
  if (condition.field === "has_attachments" || condition.field === "is_first_time_sender") {
    const boolValue = typeof raw === "boolean" ? raw : false;
    return applyBooleanOperator(condition.operator, boolValue, condition.value);
  }

  // Null string fields — only not_equals matches a null field
  if (raw === null || raw === undefined || raw === "") {
    return condition.operator === "not_equals";
  }

  const condValue = typeof condition.value === "boolean" ? String(condition.value) : condition.value;
  return applyStringOperator(condition.operator, String(raw), condValue);
}

/**
 * Evaluate a list of conditions against thread data, respecting AND/OR logic.
 *
 * Logic is evaluated left-to-right. The `logic` property of condition[i]
 * describes how condition[i] combines with condition[i+1].
 *
 * Algorithm: maintain a running accumulator. When we hit an OR boundary,
 * short-circuit if accumulator is already true. When we hit an AND boundary,
 * short-circuit if accumulator is already false.
 */
export function evaluateConditions(conditions: Condition[], thread: ThreadData): boolean {
  if (conditions.length === 0) {
    // An empty condition list matches everything (catch-all rule)
    return true;
  }

  let accumulator = evaluateCondition(conditions[0], thread);

  for (let i = 0; i < conditions.length - 1; i++) {
    const current = conditions[i];
    const next = conditions[i + 1];
    const nextResult = evaluateCondition(next, thread);

    if (current.logic === "OR") {
      accumulator = accumulator || nextResult;
    } else {
      // Default: AND
      accumulator = accumulator && nextResult;
    }
  }

  return accumulator;
}
