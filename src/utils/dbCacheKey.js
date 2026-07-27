export function toNumericDatabaseKey(value) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    return null;
  }
  const key = Number(value);
  return Number.isFinite(key) ? key : null;
}
