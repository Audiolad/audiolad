# Author payout profile encryption

Application-level AES-256-GCM for `author_payout_profiles.encrypted_payload`.

## Environment

```text
AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY=<base64 of exactly 32 random bytes>
AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY_ID=v1
PAYOUT_PROFILES_ENABLED=false
```

Requirements:

- Key exists only on the server (both blue/green deploy slots must share the same key+kid).
- Never commit the key. Never log key, plaintext, or full ciphertext.
- Without a valid key the author form must not persist real payout data (API returns controlled `encryption_unavailable`).
- `PAYOUT_PROFILES_ENABLED` is the legal/ops kill-switch. Default off. Do not treat a missing encryption key as the only gate.

## Generate a key

```bash
openssl rand -base64 32
```

Set `AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY_ID` to a short id (e.g. `v1`).

## Backup

1. Store key+kid in the same secret store used for production env (offline sealed backup).
2. Record which release first required the key.
3. Losing the key makes historical envelopes unreadable — treat as a critical secret.

## Rotation readiness (current vs future)

### What is ready now

- Envelope format is versioned (`v`, `kid`, `iv`, `ct`, `tag`).
- Helper `reencryptPayoutProfileEnvelope(currentKey, nextKey)` exists for offline/batch jobs.
- Helper is **not** exposed via public HTTP routes or ordinary admin actions.

### What is NOT implemented yet

- Runtime multi-key read (decrypt with old **or** new `kid` in the same process).
- Dual-key env loading.
- Online batch re-encryption admin job.

Until multi-key read ships, **do not** rotate production keys by swapping env alone.

### Future rotation workflow (target)

1. Keep the old key available (backup + still loaded for decrypt).
2. Add the new key and new `kid` (dual-read window).
3. Application decrypts envelopes for both kids.
4. Run batch re-encryption for all rows; verify counts.
5. Only then remove the old key from runtime env.

Today the honest status is: **envelope rotation-ready, full multi-key rotation workflow not implemented**.
