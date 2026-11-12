# Company Core Security Model v1

## Principle

AI agents are never granted Sergey's administrative authority by default.

Human admin, ops identities and machine identities are separate.

## Identity classes

### Founder Admin

Human identity for Sergey.

Capabilities may include:
- approve Human Gates;
- approve sensitive releases/actions;
- inspect full Company Dashboard;
- emergency administration.

Private keys/passphrases must never be stored in chat, repository, task records or browser payloads.

### Ops / DevOps

Separate operational identity for infrastructure maintenance.

Use least privilege and auditable commands.

### Agent Machine Identities

Each agent/service receives only the credentials/scopes required for its role.

Examples:
- GitHub read only
- GitHub issue write
- branch/PR creation
- CI read
- analytics read
- Company DB scoped access

Do not give general SSH/sudo/docker access to ordinary agents.

## Privileged surfaces

Treat all of the following as privileged:
- sudo
- Docker socket
- SSH private keys
- production credentials
- GitHub admin credentials
- deployment credentials
- database owner/superuser credentials

The Docker socket is root-equivalent and must not be mounted into ordinary agent containers.

## Sensitive action approval

Require explicit approval for:
- merge when configured as gated;
- production deploy;
- destructive DB operations;
- privilege changes;
- secret rotation;
- firewall changes;
- arbitrary host commands;
- infrastructure changes with material cost/risk.

Approvals must be persisted in `approvals` and reflected in `agent_events`.

## Network

Default deny inbound.

Expose a new port only for an identified service and documented reason.

Prefer:
- reverse proxy;
- TLS;
- authenticated API;
- internal Docker networks;
- no direct database exposure.

## Secrets

Use runtime secrets/environment injection.

Never commit:
- host addresses when not operationally necessary;
- SSH usernames as reusable access instructions;
- private key material;
- passphrases;
- API tokens;
- database passwords;
- model-provider secrets.

Public repository documentation should describe secret names/contracts, not their values.

## Production separation

Company Core is not production Audiolad.

Access from Company Core to Audiolad production must be:
- API-scoped;
- least privilege;
- separately credentialed;
- auditable;
- revocable.

No agent should gain blanket shell access to Audiolad production merely because it can operate inside Company Core.
