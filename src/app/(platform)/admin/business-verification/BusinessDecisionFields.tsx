"use client";

import { useState, type ReactNode } from "react";

import {
  businessModerationReasonPlaceholder,
  isBusinessModerationReasonOptional,
  type BusinessModerationAction,
} from "@/lib/admin/business-verification";

/**
 * Decision select + reason field of one case. The reason is optional only for «Подтвердить»
 * (Sergey 18.10 20:16 MSK); the server action and the DB RPC still enforce it for every other decision.
 */
export function BusinessDecisionFields({
  caseId,
  actions,
  children,
}: {
  caseId: string;
  actions: { value: BusinessModerationAction; label: string }[];
  children?: ReactNode;
}) {
  const [action, setAction] = useState<string>(actions[0]?.value ?? "");
  const optional = isBusinessModerationReasonOptional(action);
  return (
    <>
      <label className="block text-sm font-semibold" htmlFor={`action-${caseId}`}>Решение</label>
      <select
        id={`action-${caseId}`}
        name="action"
        className="w-full rounded-xl border border-[#e4d7f4] p-2 text-sm"
        value={action}
        onChange={(event) => setAction(event.target.value)}
      >
        {actions.map((a) => (<option key={a.value} value={a.value}>{a.label}</option>))}
      </select>
      {children}
      <label className="sr-only" htmlFor={`reason-${caseId}`}>
        {optional ? "Комментарий к решению" : "Причина решения"}
      </label>
      <textarea
        id={`reason-${caseId}`}
        name="reason"
        required={!optional}
        maxLength={2000}
        rows={3}
        placeholder={businessModerationReasonPlaceholder(action)}
        data-testid="business-decision-reason"
        className="w-full rounded-xl border border-[#e4d7f4] p-2 text-sm"
      />
    </>
  );
}
