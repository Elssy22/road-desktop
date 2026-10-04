// Id d'une tâche automatique de relance (DECISIONS.md §32), calculé exactement
// comme le mobile (mobile-legacy/src/db/crmFollowupsDb.ts, autoTaskId) : SHA-256
// de `road-followup:{utilisateur}:{contact}:{étape}`, mis au format UUID v8.
// Le desktop s'en sert pour poser des tâches déjà supprimées (« étape sautée »)
// que la séquence du mobile reconnaît et ne recrée jamais.
// Sans import : aussi utilisé tel quel par scripts/cleanup-import-tasks.ts (Node).

export async function autoTaskId(userId: string, contactId: string, kind: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`road-followup:${userId}:${contactId}:${kind}`)
  );
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const variant = ((parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
