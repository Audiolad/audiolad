# Author payout profile encryption

Application-level AES-256-GCM for `author_payout_profiles.encrypted_payload`.

## Environment

```text
AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY=<base64 of exactly 32 random bytes>
AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY_ID=v1
```

Requirements:

- Key exists only on the server (both blue/green deploy slots must share the same key+kid).
- Never commit the key. Never log key, plaintext, or full ciphertext.
- Without a valid key the author form must not persist real payout data (API returns controlled 503).

## Generate a key

```bash
openssl rand -base64 32
```

Set `AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY_ID` to a short id (e.g. `v1`).

## Backup

1. Store key+kid in the same secret store used for production env (offline sealed backup).
2. Record which release first required the key.
3. Losing the key makes historical envelopes unreadable — treat as a critical secret.

## Rotation (future)

Code exposes `reencryptPayoutProfileEnvelope` for a controlled migration job.
Until that job exists:

1. Introduce `v2` key under a new kid in a dual-read window (not implemented yet).
2. Re-encrypt rows offline with service role.
3. Retire `v1` only after all rows use `v2`.

Do not rotate by simply changing the env key without re-encryption.
