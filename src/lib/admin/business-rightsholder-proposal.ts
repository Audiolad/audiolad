export type RightsholderEntityType = "person" | "organization";
export type RightsholderProposalSource = "declared" | "account_binding" | "payout_profile" | "profile";
export type ProposalRightsholder = { id: string; display_name: string; entity_type: string; status: string };
export type RightsholderSelection =
  | { kind: "existing"; id: string }
  | { kind: "new"; displayName: string; entityType: RightsholderEntityType }
  | { kind: "none" };
export type RightsholderProposal = {
  name: string | null;
  entityType: RightsholderEntityType | null;
  source: RightsholderProposalSource | null;
  sourceLabel: string;
  needsCheck: boolean;
  warnings: string[];
  selection: RightsholderSelection;
};
export type VerifiedPayoutName = { workspaceId: string; workspaceName: string; name: string };
export type RightsholderProposalInput = {
  declared?: { name: string; entityType: RightsholderEntityType; isSelf?: boolean } | null;
  accountBinding?: ProposalRightsholder | null;
  verifiedPayoutNames?: VerifiedPayoutName[];
  sourceWorkspaceId?: string | null;
  profileName?: string | null;
  activeRightsholders?: ProposalRightsholder[];
};

export function normalizeRightsholderName(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase().replace(/ё/g, "е");
}

/** Reset decision fields and confirmation when the server proposal changes. */
export function rightsholderProposalKey(proposal: RightsholderProposal): string {
  const selection = proposal.selection;
  switch (selection.kind) {
    case "existing": return JSON.stringify([selection.kind, selection.id, proposal.name, proposal.entityType]);
    case "new": return JSON.stringify([selection.kind, selection.displayName, selection.entityType]);
    case "none": return JSON.stringify([selection.kind]);
  }
}

export function buildRightsholderProposal(input: RightsholderProposalInput): RightsholderProposal {
  const warnings: string[] = [];
  function named(name: string, entityType: RightsholderEntityType, source: RightsholderProposalSource, sourceLabel: string, needsCheck: boolean): RightsholderProposal {
    name = name.trim().replace(/\s+/g, " ");
    const existing = input.activeRightsholders?.find((r) => r.status === "active" && r.entity_type === entityType && normalizeRightsholderName(r.display_name) === normalizeRightsholderName(name));
    return {
      name, entityType, source, needsCheck, warnings,
      sourceLabel: sourceLabel + (existing ? " – найден существующий правообладатель" : ""),
      selection: existing ? { kind: "existing", id: existing.id } : { kind: "new", displayName: name, entityType },
    };
  }
  if (input.declared?.name.trim()) {
    const label = input.declared.isSelf === true
      ? "Указано автором в заявке – сам автор"
      : input.declared.isSelf === false
        ? "Указано автором в заявке – другое лицо (лейбл, соавтор)"
        : "Указано автором в заявке";
    return named(input.declared.name, input.declared.entityType, "declared", label, false);
  }
  const bound = input.accountBinding;
  if (bound?.status === "active" && (bound.entity_type === "person" || bound.entity_type === "organization")) {
    return { name: bound.display_name, entityType: bound.entity_type, source: "account_binding", sourceLabel: "Уже привязан к аккаунту – не указано автором – проверьте", needsCheck: true, warnings, selection: { kind: "existing", id: bound.id } };
  }
  const payouts = (input.verifiedPayoutNames ?? []).filter((p) => p.name.trim()).sort((a, b) => a.workspaceName.localeCompare(b.workspaceName, "ru") || a.workspaceId.localeCompare(b.workspaceId));
  if (payouts.length) {
    if (new Set(payouts.map((p) => normalizeRightsholderName(p.name))).size > 1) warnings.push("В анкетах выплат аккаунта разные имена – проверьте");
    const preferred = payouts.find((p) => p.workspaceId === input.sourceWorkspaceId) ?? payouts[0];
    return named(preferred.name, "person", "payout_profile", "Из подтверждённых данных для выплат – не указано автором – проверьте", true);
  }
  if (input.profileName?.trim()) {
    return named(input.profileName, "person", "profile", "Из профиля аккаунта – не указано автором – проверьте", true);
  }
  return { name: null, entityType: null, source: null, sourceLabel: "Имя правообладателя не указано – выберите или введите вручную", needsCheck: true, warnings, selection: { kind: "none" } };
}
