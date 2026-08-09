# Launch checklist

Nothing here is complete. This is the gate list, kept honest.

## Blocking — cannot sell without these

- [ ] RLS integration tests pass against a live database (`docs/TEST_PLAN.md`)
- [ ] Third-party security review
- [ ] Real privacy policy and terms (current pages are placeholders)
- [ ] Data processing agreement, GDPR export and deletion workflows
- [ ] Tenant credential vault with envelope encryption and a KMS
- [ ] Rate limiting and abuse monitoring
- [ ] Stripe test-mode subscription lifecycle verified end to end
- [ ] Entitlements enforced server-side, never from client state
- [ ] Backup and restore rehearsed, not just configured
- [ ] Error and uptime monitoring

## Product

- [ ] New user can register, onboard, and reach a useful dashboard
- [ ] Demo Workspace labelled everywhere and internally consistent
- [ ] Imported data produces accurate metrics
- [ ] Profit by product accounts for COGS, fees, refunds, explicit ad allocation
- [ ] Assistant answers from tenant data and cites sources
- [ ] Write actions require argument-bound approval
- [ ] Calendar integrations accurate about what syncs which way
- [ ] Owner console unreachable by ordinary users
- [ ] Key desktop and mobile flows verified in a real browser
- [ ] No production screen substitutes fake data

## Commercial

- [ ] Plan names, prices, trial length owner-configurable, not hardcoded
- [ ] No claim of guaranteed revenue anywhere in the product or marketing
- [ ] Trademark clearance on the final product name before public launch
- [ ] App Store review prep, if a native companion ships
