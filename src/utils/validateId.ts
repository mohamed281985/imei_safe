export function validateId(id: string | number): number | null {
  if (typeof id === 'number') {
    if (!Number.isFinite(id) || id <= 0 || id > Number.MAX_SAFE_INTEGER) return null;
    return Math.floor(id);
  }
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const n = parseInt(trimmed, 10);
  if (isNaN(n) || n <= 0 || n > Number.MAX_SAFE_INTEGER) return null;
  return n;
}

export default validateId;
