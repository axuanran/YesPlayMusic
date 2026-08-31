import { describe, expect, it } from 'vitest';

import { createRequestGeneration } from '../requestGeneration';

describe('request generation', () => {
  it('accepts only the latest request', () => {
    const generation = createRequestGeneration();
    const first = generation.next();
    const second = generation.next();

    expect(generation.isCurrent(first)).toBe(false);
    expect(generation.current()).toBe(second);
    expect(generation.isCurrent(second)).toBe(true);
  });

  it('invalidates the active request during teardown', () => {
    const generation = createRequestGeneration();
    const request = generation.next();

    generation.invalidate();

    expect(generation.isCurrent(request)).toBe(false);
  });
});
