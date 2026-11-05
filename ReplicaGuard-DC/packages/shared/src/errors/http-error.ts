/**
 * HttpError is a typed error class that carries an HTTP status code and a
 * machine-readable error code string, making it easy to convert to a JSON
 * error response in Fastify error handlers.
 *
 * @example
 * throw new HttpError(404, 'FILE_NOT_FOUND', 'File abc123 does not exist.');
 */
export class HttpError extends Error {
  /** HTTP status code (e.g. 404, 409, 507). */
  public readonly statusCode: number;
  /**
   * Uppercase snake_case error code for machine-readable error identification.
   * Clients can switch on this value without parsing the message string.
   */
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;

    // Maintain correct prototype chain when extending built-ins in TypeScript.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
