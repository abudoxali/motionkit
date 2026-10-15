import {describe, expect, it} from 'vitest';
import {referenceSlug} from '../reference-import';

describe('reference import naming', () => {
  it('normalizes a user label into a portable directory name', () => {
    expect(referenceSlug('  Product Launch 2026!  ')).toBe('product-launch-2026');
  });

  it('rejects a label that has no portable characters', () => {
    expect(() => referenceSlug('!!!')).toThrow('Reference name must contain letters or numbers');
  });
});
