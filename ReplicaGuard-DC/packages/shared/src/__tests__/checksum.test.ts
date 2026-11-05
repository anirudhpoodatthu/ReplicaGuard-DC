import {
  computeChecksum,
  verifyChecksum,
  isValidChecksumFormat,
} from '../utils/checksum';

describe('computeChecksum', () => {
  it('returns a string prefixed with "sha256:"', () => {
    const result = computeChecksum(Buffer.from('hello'));
    expect(result).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('produces the known SHA-256 for "hello"', () => {
    // echo -n "hello" | sha256sum → 2cf24dba...
    const result = computeChecksum(Buffer.from('hello'));
    expect(result).toBe(
      'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('is deterministic — same input always yields same output', () => {
    const data = Buffer.from('ReplicaGuard');
    expect(computeChecksum(data)).toBe(computeChecksum(data));
  });

  it('produces different checksums for different inputs', () => {
    expect(computeChecksum(Buffer.from('aaa'))).not.toBe(
      computeChecksum(Buffer.from('bbb')),
    );
  });

  it('handles an empty buffer without throwing', () => {
    // SHA-256 of empty string is a well-known value
    const result = computeChecksum(Buffer.alloc(0));
    expect(result).toBe(
      'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('handles binary data (not just ASCII strings)', () => {
    const binary = Buffer.from([0x00, 0xff, 0xab, 0x12]);
    const result = computeChecksum(binary);
    expect(result).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe('verifyChecksum', () => {
  it('returns true when checksum matches', () => {
    const data = Buffer.from('hello');
    const checksum = computeChecksum(data);
    expect(verifyChecksum(data, checksum)).toBe(true);
  });

  it('returns false when checksum does not match', () => {
    const data = Buffer.from('hello');
    const wrongChecksum =
      'sha256:0000000000000000000000000000000000000000000000000000000000000000';
    expect(verifyChecksum(data, wrongChecksum)).toBe(false);
  });

  it('returns false when data has been altered', () => {
    const original = Buffer.from('original');
    const checksum = computeChecksum(original);
    const tampered = Buffer.from('tampered');
    expect(verifyChecksum(tampered, checksum)).toBe(false);
  });
});

describe('isValidChecksumFormat', () => {
  it('returns true for a valid sha256 checksum string', () => {
    const valid =
      'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
    expect(isValidChecksumFormat(valid)).toBe(true);
  });

  it('returns false for a string missing the sha256: prefix', () => {
    expect(
      isValidChecksumFormat(
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      ),
    ).toBe(false);
  });

  it('returns false for a checksum that is too short', () => {
    expect(isValidChecksumFormat('sha256:abc123')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidChecksumFormat('')).toBe(false);
  });

  it('returns false for uppercase hex (checksum must be lowercase)', () => {
    expect(
      isValidChecksumFormat(
        'sha256:2CF24DBA5FB0A30E26E83B2AC5B9E29E1B161E5C1FA7425E73043362938B9824',
      ),
    ).toBe(false);
  });
});
