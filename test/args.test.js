import { describe, expect, it } from 'vitest';
import { argStringToArray } from '../src/args.js';

describe('argStringToArray', () => {
  it('splits on spaces and drops empties', () => {
    expect(argStringToArray('  -bucket test   -v ')).toEqual(['-bucket', 'test', '-v']);
  });
  it('groups double-quoted parts', () => {
    expect(argStringToArray('-source "my site" -ignore "^a b$"')).toEqual(['-source', 'my site', '-ignore', '^a b$']);
  });
  it('keeps escaped quotes and other backslashes', () => {
    expect(argStringToArray('"say \\"hi\\"" C:\\dir')).toEqual(['say "hi"', 'C:\\dir']);
  });
  it('treats newlines as separators', () => {
    expect(argStringToArray('-bucket test\n-path trans-game/\r\n-v')).toEqual(['-bucket', 'test', '-path', 'trans-game/', '-v']);
  });
  it('returns [] for empty input', () => {
    expect(argStringToArray('')).toEqual([]);
    expect(argStringToArray(undefined)).toEqual([]);
  });
});
