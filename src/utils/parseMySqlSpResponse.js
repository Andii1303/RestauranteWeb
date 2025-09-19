export function parseMySqlSpResponse(results) {
  const sets = Array.isArray(results) ? results : [];
  const flat = sets.flatMap((rs) => (Array.isArray(rs) ? rs : []));
  const statusRow = flat.find(
    (r) =>
      r &&
      typeof r === "object" &&
      (Object.hasOwn(r, "ok") || Object.hasOwn(r, "success") || Object.hasOwn(r, "message"))
  );
  const ok = statusRow?.ok ?? statusRow?.success ?? true;
  const message = statusRow?.message;
  const dataCandidates = flat.filter((x) => x !== statusRow);

  return {
    ok: Boolean(ok),
    ...(message ? { message } : {}),
    ...(dataCandidates.length ? { data: dataCandidates.length === 1 ? dataCandidates[0] : dataCandidates } : {}),
  };
}
export const DB_NAME = 'restauranteDB'