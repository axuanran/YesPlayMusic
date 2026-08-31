export function createRequestGeneration() {
  let current = 0;
  return {
    current() {
      return current;
    },
    invalidate() {
      current += 1;
    },
    isCurrent(requestId) {
      return requestId === current;
    },
    next() {
      current += 1;
      return current;
    },
  };
}
