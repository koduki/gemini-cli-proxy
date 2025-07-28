import { describe, it, expect } from 'vitest';
import { generateSessionId } from './index';

describe('generateSessionId', () => {
  it('should return a string', () => {
    expect(typeof generateSessionId()).toBe('string');
  });

  it('should not be empty', () => {
    expect(generateSessionId()).not.toBe('');
  });
});
