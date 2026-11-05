import { HttpError } from '../errors/http-error';

describe('HttpError', () => {
  it('stores statusCode, code, and message correctly', () => {
    const err = new HttpError(404, 'FILE_NOT_FOUND', 'File abc123 does not exist.');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('FILE_NOT_FOUND');
    expect(err.message).toBe('File abc123 does not exist.');
  });

  it('is an instance of Error', () => {
    const err = new HttpError(500, 'INTERNAL_ERROR', 'Something went wrong.');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HttpError);
  });

  it('sets the name property to "HttpError"', () => {
    const err = new HttpError(400, 'BAD_REQUEST', 'Invalid input.');
    expect(err.name).toBe('HttpError');
  });

  it('can be caught and identified with instanceof', () => {
    const fn = () => {
      throw new HttpError(409, 'CONFLICT', 'Resource already exists.');
    };
    try {
      fn();
      fail('Expected an error to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      if (e instanceof HttpError) {
        expect(e.statusCode).toBe(409);
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('preserves the correct prototype chain', () => {
    const err = new HttpError(503, 'SERVICE_UNAVAILABLE', 'No healthy nodes.');
    expect(Object.getPrototypeOf(err)).toBe(HttpError.prototype);
  });
});
