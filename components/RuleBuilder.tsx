"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Play,
  Save,
  ChevronDown,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useToast } from "@/components/Toast";

export type ConditionField =
  | "sender_email"
  | "sender_domain"
  | "subject"
  | "ai_category"
  | "ai_priority"
  | "ai_intent"
  | "has_attachments";

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "is_true"
  | "is_false";

export type ActionType = "apply_tag" | "archive" | "delete" | "star" | "forward";

export interface RuleCondition {
  id: string;
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
}

export interface RuleAction {
  id: string;
  type: ActionType;
  params: string;
}

export interface RuleData {
  id?: string;
  name: string;
  conditionLogic: "AND" | "OR";
  conditions: RuleCondition[];
  actions: RuleAction[];
  priority: number;
  enabled: boolean;
}

interface RuleBuilderProps {
  rule?: RuleData;
  onSaved?: (rule: RuleData) => void;
  onCancel?: () => void;
}

const FIELD_LABELS: Record<ConditionField, string> = {
  sender_email: "Sender Email",
  sender_domain: "Sender Domain",
  subject: "Subject",
  ai_category: "AI Category",
  ai_priority: "AI Priority",
  ai_intent: "AI Intent",
  has_attachments: "Has Attachments",
};

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals: "equals",
  not_equals: "does not equal",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  is_true: "is true",
  is_false: "is false",
};

const ACTION_LABELS: Record<ActionType, string> = {
  apply_tag: "Apply Tag",
  archive: "Archive",
  delete: "Delete",
  star: "Star",
  forward: "Forward to",
};

const BOOLEAN_FIELDS: ConditionField[] = ["has_attachments"];
const BOOLEAN_OPERATORS: ConditionOperator[] = ["is_true", "is_false"];
const VALUE_OPERATORS: ConditionOperator[] = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
];

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function defaultCondition(): RuleCondition {
  return { id: generateId(), field: "sender_email", operator: "contains", value: "" };
}

function defaultAction(): RuleAction {
  return { id: generateId(), type: "apply_tag", params: "" };
}

function operatorsForField(field: ConditionField): ConditionOperator[] {
  if (BOOLEAN_FIELDS.includes(field)) return BOOLEAN_OPERATORS;
  return VALUE_OPERATORS;
}

/**
 * Convert backend condition format (with `logic`, no `id`) to frontend format.
 * Also handles already-frontend-shaped conditions gracefully.
 */
function parseConditions(
  raw: Array<Record<string, unknown>> | undefined,
): { conditions: RuleCondition[]; logic: "AND" | "OR" } {
  if (!raw || raw.length === 0) {
    return { conditions: [defaultCondition()], logic: "AND" };
  }
  // Infer conditionLogic from the first condition's `logic` field (backend format)
  const firstLogic = typeof raw[0].logic === "string" ? raw[0].logic : "AND";
  const logic = firstLogic === "OR" ? "OR" as const : "AND" as const;

  const conditions: RuleCondition[] = raw.map((c) => {
    const field = (typeof c.field === "string" ? c.field : "sender_email") as ConditionField;
    let operator = (typeof c.operator === "string" ? c.operator : "contains") as ConditionOperator;
    let value = typeof c.value === "string" ? c.value : "";

    // Handle boolean values from backend (value: true/false instead of operator is_true/is_false)
    if (BOOLEAN_FIELDS.includes(field)) {
      if (typeof c.value === "boolean") {
        operator = c.value ? "is_true" : "is_false";
        value = "";
      }
    }

    return {
      id: typeof c.id === "string" ? c.id : generateId(),
      field,
      operator,
      value,
    };
  });

  return { conditions, logic };
}

/**
 * Convert backend action format (params is object, no `id`) to frontend format.
 */
function parseActions(raw: Array<Record<string, unknown>> | undefined): RuleAction[] {
  if (!raw || raw.length === 0) return [defaultAction()];
  return raw.map((a) => {
    const type = (typeof a.type === "string" ? a.type : "apply_tag") as ActionType;
    let params = "";

    if (typeof a.params === "object" && a.params !== null) {
      const p = a.params as Record<string, unknown>;
      if (type === "apply_tag" && typeof p.tagName === "string") params = p.tagName;
      else if (type === "forward" && typeof p.to === "string") params = p.to;
    } else if (typeof a.params === "string") {
      params = a.params;
    }

    return {
      id: typeof a.id === "string" ? a.id : generateId(),
      type,
      params,
    };
  });
}

export function RuleBuilder({ rule, onSaved, onCancel }: RuleBuilderProps) {
  const toast = useToast();
  const [name, setName] = useState(rule?.name ?? "");

  // Parse backend conditions/actions into frontend shape
  const parsed = parseConditions(
    rule?.conditions as unknown as Array<Record<string, unknown>> | undefined,
  );
  const [conditionLogic, setConditionLogic] = useState<"AND" | "OR">(
    rule?.conditionLogic ?? parsed.logic,
  );
  const [conditions, setConditions] = useState<RuleCondition[]>(parsed.conditions);
  const [actions, setActions] = useState<RuleAction[]>(
    parseActions(rule?.actions as unknown as Array<Record<string, unknown>> | undefined),
  );
  const [priority, setPriority] = useState(rule?.priority ?? 10);
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  function updateCondition(id: string, patch: Partial<RuleCondition>) {
    setConditions((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, ...patch };
        // Reset operator when field changes
        if (patch.field !== undefined) {
          const validOps = operatorsForField(updated.field);
          if (!validOps.includes(updated.operator)) {
            updated.operator = validOps[0];
          }
        }
        return updated;
      }),
    );
  }

  function removeCondition(id: string) {
    setConditions((prev) => prev.filter((c) => c.id !== id));
  }

  function updateAction(id: string, patch: Partial<RuleAction>) {
    setActions((prev) => prev.map((a) => (a.id !== id ? a : { ...a, ...patch })));
  }

  function removeAction(id: string) {
    setActions((prev) => prev.filter((a) => a.id !== id));
  }

  function validate(): string | null {
    if (!name.trim()) return "Rule name is required.";
    if (conditions.length === 0) return "At least one condition is required.";
    if (actions.length === 0) return "At least one action is required.";
    for (const c of conditions) {
      const needsValue = !BOOLEAN_FIELDS.includes(c.field);
      if (needsValue && !c.value.trim()) return "All conditions must have a value.";
    }
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) { toast.show(err, "error"); return; }

    setSaving(true);
    try {
      // Transform frontend shape to backend API shape:
      // - conditions: strip `id`, add `logic` from conditionLogic
      // - actions: strip `id`, wrap `params` string into an object
      const apiConditions = conditions.map((c) => ({
        field: c.field,
        operator: c.operator,
        value: BOOLEAN_FIELDS.includes(c.field)
          ? c.operator === "is_true"
          : c.value,
        logic: conditionLogic,
      }));

      const apiActions = actions.map((a) => ({
        type: a.type,
        params:
          a.type === "apply_tag"
            ? { tagName: a.params }
            : a.type === "forward"
              ? { to: a.params }
              : {},
      }));

      const payload = {
        name: name.trim(),
        conditions: apiConditions,
        actions: apiActions,
        priority,
        enabled,
      };
      const res = await fetch(rule?.id ? `/api/rules/${rule.id}` : "/api/rules", {
        method: rule?.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Save failed", "error");
        return;
      }
      const saved = (await res.json()) as RuleData;
      toast.show(rule?.id ? "Rule updated." : "Rule created.", "success");
      onSaved?.(saved);
    } catch {
      toast.show("Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!rule?.id) {
      toast.show("Save the rule first to test it.", "info");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch(`/api/rules/${rule.id}/test`, { method: "POST" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.show(j.error ?? "Test failed", "error");
        return;
      }
      const j = (await res.json()) as { matchCount?: number };
      toast.show(
        `Rule matched ${j.matchCount ?? 0} thread${j.matchCount !== 1 ? "s" : ""}.`,
        "info",
      );
    } catch {
      toast.show("Test failed", "error");
    } finally {
      setTesting(false);
    }
  }

  const inputClass =
    "rounded-lg border border-border bg-surface-0 py-2 px-3 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

  const selectClass =
    "appearance-none rounded-lg border border-border bg-surface-0 py-2 pl-3 pr-8 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

  return (
    <div className="space-y-6">
      {/* Name + Priority row */}
      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <label className="text-xs font-medium text-text-muted">Rule Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Archive newsletters"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-muted">Priority</label>
          <input
            type="number"
            min={1}
            max={100}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className={`${inputClass} w-24`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-muted">Enabled</label>
          <button
            type="button"
            onClick={() => setEnabled((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              enabled
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-border bg-surface-0 text-text-muted"
            }`}
          >
            {enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            {enabled ? "Enabled" : "Disabled"}
          </button>
        </div>
      </div>

      {/* Conditions */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <h3 className="text-sm font-semibold text-text-primary">Conditions</h3>
          <div className="flex overflow-hidden rounded-lg border border-border">
            {(["AND", "OR"] as const).map((logic) => (
              <button
                key={logic}
                type="button"
                onClick={() => setConditionLogic(logic)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  conditionLogic === logic
                    ? "bg-accent text-accent-text"
                    : "bg-surface-0 text-text-muted hover:bg-surface-2"
                }`}
              >
                {logic}
              </button>
            ))}
          </div>
          <span className="text-xs text-text-muted">between conditions</span>
        </div>

        <div className="space-y-3">
          {conditions.map((cond, index) => {
            const validOps = operatorsForField(cond.field);
            const needsValue = !BOOLEAN_FIELDS.includes(cond.field);
            return (
              /* Mobile: vertical card layout so each select gets a full row.
                 Desktop (sm+): compact horizontal inline layout. */
              <div key={cond.id} className="rounded-lg border border-border bg-surface-0 p-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
                {/* Connector label row (mobile card header) */}
                <div className="mb-2 flex items-center justify-between sm:hidden">
                  <span className="text-xs font-medium text-text-muted">
                    {index === 0 ? "If" : conditionLogic}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCondition(cond.id)}
                    disabled={conditions.length === 1}
                    className="rounded-md p-2 text-text-muted transition-colors hover:bg-danger-muted hover:text-danger disabled:opacity-30"
                    aria-label="Remove condition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Desktop connector label (inline, hidden on mobile) */}
                <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2">
                  {index === 0 ? (
                    <span className="w-8 text-center text-xs text-text-muted">If</span>
                  ) : (
                    <span className="w-8 text-center text-xs font-medium text-text-muted">
                      {conditionLogic}
                    </span>
                  )}

                  {/* Field — desktop inline */}
                  <div className="relative">
                    <select
                      value={cond.field}
                      onChange={(e) =>
                        updateCondition(cond.id, { field: e.target.value as ConditionField })
                      }
                      className={selectClass}
                    >
                      {(Object.keys(FIELD_LABELS) as ConditionField[]).map((f) => (
                        <option key={f} value={f}>
                          {FIELD_LABELS[f]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted" />
                  </div>

                  {/* Operator — desktop inline */}
                  <div className="relative">
                    <select
                      value={cond.operator}
                      onChange={(e) =>
                        updateCondition(cond.id, { operator: e.target.value as ConditionOperator })
                      }
                      className={selectClass}
                    >
                      {validOps.map((op) => (
                        <option key={op} value={op}>
                          {OPERATOR_LABELS[op]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted" />
                  </div>

                  {/* Value — desktop inline */}
                  {needsValue && (
                    <input
                      type="text"
                      value={cond.value}
                      onChange={(e) => updateCondition(cond.id, { value: e.target.value })}
                      placeholder="Value..."
                      className={`min-w-32 flex-1 ${inputClass}`}
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => removeCondition(cond.id)}
                    disabled={conditions.length === 1}
                    className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-danger-muted hover:text-danger disabled:opacity-30"
                    aria-label="Remove condition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Mobile stacked fields (hidden on sm+) */}
                <div className="space-y-2 sm:hidden">
                  {/* Field */}
                  <div className="relative">
                    <label className="mb-1 block text-[10px] font-medium text-text-muted">Field</label>
                    <select
                      value={cond.field}
                      onChange={(e) =>
                        updateCondition(cond.id, { field: e.target.value as ConditionField })
                      }
                      className={`w-full ${selectClass}`}
                    >
                      {(Object.keys(FIELD_LABELS) as ConditionField[]).map((f) => (
                        <option key={f} value={f}>
                          {FIELD_LABELS[f]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="pointer-events-none absolute right-2 top-[2.1rem] text-text-muted" />
                  </div>

                  {/* Operator */}
                  <div className="relative">
                    <label className="mb-1 block text-[10px] font-medium text-text-muted">Operator</label>
                    <select
                      value={cond.operator}
                      onChange={(e) =>
                        updateCondition(cond.id, { operator: e.target.value as ConditionOperator })
                      }
                      className={`w-full ${selectClass}`}
                    >
                      {validOps.map((op) => (
                        <option key={op} value={op}>
                          {OPERATOR_LABELS[op]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="pointer-events-none absolute right-2 top-[2.1rem] text-text-muted" />
                  </div>

                  {/* Value */}
                  {needsValue && (
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-text-muted">Value</label>
                      <input
                        type="text"
                        value={cond.value}
                        onChange={(e) => updateCondition(cond.id, { value: e.target.value })}
                        placeholder="Value..."
                        className={`w-full ${inputClass}`}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setConditions((prev) => [...prev, defaultCondition()])}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <Plus size={13} />
          Add condition
        </button>
      </section>

      {/* Actions */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Actions</h3>

        <div className="space-y-3">
          {actions.map((action) => {
            const needsParams = action.type === "apply_tag" || action.type === "forward";
            return (
              /* Same mobile card pattern as conditions */
              <div key={action.id} className="rounded-lg border border-border bg-surface-0 p-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
                {/* Mobile card header */}
                <div className="mb-2 flex items-center justify-between sm:hidden">
                  <span className="text-xs font-medium text-text-muted">Then</span>
                  <button
                    type="button"
                    onClick={() => removeAction(action.id)}
                    disabled={actions.length === 1}
                    className="rounded-md p-2 text-text-muted transition-colors hover:bg-danger-muted hover:text-danger disabled:opacity-30"
                    aria-label="Remove action"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Desktop inline layout */}
                <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2">
                  <span className="text-xs text-text-muted">Then</span>
                  <div className="relative">
                    <select
                      value={action.type}
                      onChange={(e) =>
                        updateAction(action.id, { type: e.target.value as ActionType })
                      }
                      className={selectClass}
                    >
                      {(Object.keys(ACTION_LABELS) as ActionType[]).map((t) => (
                        <option key={t} value={t}>
                          {ACTION_LABELS[t]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted" />
                  </div>
                  {needsParams && (
                    <input
                      type="text"
                      value={action.params}
                      onChange={(e) => updateAction(action.id, { params: e.target.value })}
                      placeholder={
                        action.type === "apply_tag" ? "Tag name..." : "Forward to email..."
                      }
                      className={`min-w-32 flex-1 ${inputClass}`}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeAction(action.id)}
                    disabled={actions.length === 1}
                    className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-danger-muted hover:text-danger disabled:opacity-30"
                    aria-label="Remove action"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Mobile stacked layout */}
                <div className="space-y-2 sm:hidden">
                  <div className="relative">
                    <label className="mb-1 block text-[10px] font-medium text-text-muted">Action</label>
                    <select
                      value={action.type}
                      onChange={(e) =>
                        updateAction(action.id, { type: e.target.value as ActionType })
                      }
                      className={`w-full ${selectClass}`}
                    >
                      {(Object.keys(ACTION_LABELS) as ActionType[]).map((t) => (
                        <option key={t} value={t}>
                          {ACTION_LABELS[t]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="pointer-events-none absolute right-2 top-[2.1rem] text-text-muted" />
                  </div>
                  {needsParams && (
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-text-muted">
                        {action.type === "apply_tag" ? "Tag name" : "Forward to"}
                      </label>
                      <input
                        type="text"
                        value={action.params}
                        onChange={(e) => updateAction(action.id, { params: e.target.value })}
                        placeholder={
                          action.type === "apply_tag" ? "Tag name..." : "Forward to email..."
                        }
                        className={`w-full ${inputClass}`}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setActions((prev) => [...prev, defaultAction()])}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <Plus size={13} />
          Add action
        </button>
      </section>

      {/* Footer buttons — on mobile the Save button is full-width for easy reach.
          On sm+ it uses ml-auto to push to the right in the flex row. */}
      <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:flex-wrap sm:items-center">
        {rule?.id && (
          <button
            type="button"
            disabled={testing}
            onClick={handleTest}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50 sm:w-auto sm:py-2"
          >
            {testing ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            Test Rule
          </button>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 sm:w-auto sm:py-2"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50 sm:ml-auto sm:w-auto sm:py-2"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {rule?.id ? "Update Rule" : "Save Rule"}
        </button>
      </div>
    </div>
  );
}
