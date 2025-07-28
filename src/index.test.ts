import { describe, it, expect, vi } from 'vitest';
import { generateSessionId } from './index';

// Mock the githubAuth module to avoid environment variable errors during testing
vi.mock('./githubAuth.js', () => ({
  getInstallationAccessToken: vi.fn().mockResolvedValue('test-token'),
}));

describe('generateSessionId', () => {
  it('should return a string', () => {
    expect(typeof generateSessionId()).toBe('string');
  });

  it('should not be empty', () => {
    expect(generateSessionId()).not.toBe('');
  });
});
