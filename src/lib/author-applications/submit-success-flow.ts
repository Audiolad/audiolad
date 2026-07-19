export type SubmitSuccessFlowAction =
  | { type: "noop" }
  | { type: "complete_initial_submit" }
  | { type: "complete_contact_update" };

export function resolveSubmitSuccessFlow(input: {
  submitted: boolean;
  hasSubmittedContacts: boolean;
  contactUpdateSubmitPending: boolean;
  initialSubmitAlreadyHandled: boolean;
}): SubmitSuccessFlowAction {
  if (!input.submitted || !input.hasSubmittedContacts) {
    return { type: "noop" };
  }

  if (input.contactUpdateSubmitPending) {
    return { type: "complete_contact_update" };
  }

  if (input.initialSubmitAlreadyHandled) {
    return { type: "noop" };
  }

  return { type: "complete_initial_submit" };
}
