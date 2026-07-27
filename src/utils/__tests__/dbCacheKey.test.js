import { describe, expect, it } from 'vitest';
import { toNumericDatabaseKey } from '../dbCacheKey';

describe('numeric database cache keys', () => {
  it('accepts numeric music IDs', () => {
    expect(toNumericDatabaseKey(123)).toBe(123);
    expect(toNumericDatabaseKey('456')).toBe(456);
  });

  it('rejects local and streaming track IDs', () => {
    expect(toNumericDatabaseKey('local:track')).toBeNull();
    expect(toNumericDatabaseKey('stream:connection:item')).toBeNull();
    expect(toNumericDatabaseKey(undefined)).toBeNull();
    expect(toNumericDatabaseKey(null)).toBeNull();
    expect(toNumericDatabaseKey('')).toBeNull();
  });
});
