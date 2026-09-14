alter table public.quote_approvals
  add column approver_name text,
  add column consent_version text;

alter table public.quote_approvals
  add constraint quote_approvals_approver_name_check
    check (approver_name is null or (char_length(approver_name) between 1 and 100 and approver_name !~ '[[:cntrl:]]')),
  add constraint quote_approvals_consent_version_check
    check (consent_version is null or char_length(consent_version) between 1 and 50);
