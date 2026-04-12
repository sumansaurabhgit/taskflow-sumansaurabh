export class AppError extends Error {
  public readonly statusCode: number;
  public readonly fields?: Record<string, string>;

  constructor(
    message: string,
    statusCode: number,
    fields?: Record<string, string>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.fields = fields;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message: string, fields?: Record<string, string>): AppError {
    return new AppError(message, 400, fields);
  }

  static unauthorized(message = 'unauthorized'): AppError {
    return new AppError(message, 401);
  }

  static forbidden(message = 'forbidden'): AppError {
    return new AppError(message, 403);
  }

  static notFound(message = 'not found'): AppError {
    return new AppError(message, 404);
  }

  static conflict(message: string): AppError {
    return new AppError(message, 409);
  }
}
