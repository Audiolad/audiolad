"use client";

import { useState } from "react";
import {
  businessModerationReasonPlaceholder,
  isBusinessModerationReasonOptional,
  type BusinessModerationAction,
} from "@/lib/admin/business-verification";

type RightsholderOption = { id: string; display_name: string; entity_type: string };
export function BusinessDecisionFields({ caseId, actions, rightsholders, applicantName, workspaceNames }: {
  caseId: string;
  actions: { value: BusinessModerationAction; label: string }[];
  rightsholders: RightsholderOption[];
  applicantName: string | null;
  workspaceNames: string[];
}) {
  const [action, setAction] = useState<string>("");
  const [binding, setBinding] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const optional = isBusinessModerationReasonOptional(action);
  const selected = rightsholders.find((r) => r.id === binding);
  const name = binding === "new" ? newName.trim() : selected?.display_name;
  const type = binding === "new" ? newType : selected?.entity_type;
  const typeLabel = type === "person" ? "физлицо" : type === "organization" ? "организация" : "тип не выбран";
  const inputClass = "min-w-0 w-full rounded-xl border border-[#e4d7f4] p-2 text-sm";
  return (
    <>
      <label className="block text-sm font-semibold" htmlFor={`action-${caseId}`}>Решение</label>
      <select id={`action-${caseId}`} name="action" required className={inputClass} value={action}
        onChange={(event) => { setAction(event.target.value); setConfirmed(false); }}>
        <option value="">Выберите решение</option>
        {actions.map((a) => (<option key={a.value} value={a.value}>{a.label}</option>))}
      </select>
      {action === "approve" && actions.some((a) => a.value === "approve") ? (
        <fieldset className="min-w-0 space-y-2 text-sm">
          <legend className="text-[#796ba0]">Правообладатель</legend>
          <label className="sr-only" htmlFor={`rightsholder-${caseId}`}>Правообладатель</label>
          <select id={`rightsholder-${caseId}`} name="rightsholder" required className={inputClass} value={binding}
            onChange={(event) => { setBinding(event.target.value); setConfirmed(false); }}>
            <option value="">Выберите правообладателя</option>
            {rightsholders.map((r) => (<option key={r.id} value={r.id}>{r.display_name} ({r.entity_type === "organization" ? "организация" : "физлицо"})</option>))}
            <option value="new">Создать нового</option>
          </select>
          {binding === "new" ? (
            <>
              <label className="block" htmlFor={`new-name-${caseId}`}>Имя нового правообладателя</label>
              <input id={`new-name-${caseId}`} name="newDisplayName" required maxLength={200} className={inputClass} value={newName}
                onChange={(event) => { setNewName(event.target.value); setConfirmed(false); }} />
              <label className="sr-only" htmlFor={`new-type-${caseId}`}>Тип правообладателя</label>
              <select id={`new-type-${caseId}`} name="newEntityType" required className={inputClass} value={newType}
                onChange={(event) => { setNewType(event.target.value); setConfirmed(false); }}>
                <option value="">Выберите тип</option>
                <option value="person">Физлицо</option>
                <option value="organization">Организация</option>
              </select>
            </>
          ) : null}
          <p aria-live="polite" className="break-words rounded-xl bg-[#fff8e8] p-3">
            Подтверждаю: правообладатель «{name || "не выбран"}» ({typeLabel}) для аккаунта «{applicantName || "имя не заполнено"}» / авторских проектов: {workspaceNames.length ? workspaceNames.join(", ") : "нет"}; охват – все треки аккаунта и всех его авторских проектов в АудиоЛад Бизнес
          </p>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="confirmScope" value="yes" required checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 shrink-0" />
            <span>Подтверждаю правообладателя и охват решения, указанные выше</span>
          </label>
        </fieldset>
      ) : null}
      <label className="sr-only" htmlFor={`reason-${caseId}`}>{optional ? "Комментарий к решению" : "Причина решения"}</label>
      <textarea id={`reason-${caseId}`} name="reason" required={!optional} maxLength={2000} rows={3}
        placeholder={businessModerationReasonPlaceholder(action)} data-testid="business-decision-reason" className={inputClass} />
    </>
  );
}
