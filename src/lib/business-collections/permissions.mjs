/**
 * A supplied invalid/revoked capability never falls back to a different collection.
 * @template T
 * @param {{token: string|null, userId: string|null, byToken: (token:string)=>Promise<T|null>, byAccount: (userId:string)=>Promise<T|null>}} input
 * @returns {Promise<T|null>}
 */
export async function resolveCollectionPermission(input) {
  if (input.token !== null) return /^[0-9a-f]{64}$/.test(input.token) ? input.byToken(input.token) : null;
  return input.userId ? input.byAccount(input.userId) : null;
}
