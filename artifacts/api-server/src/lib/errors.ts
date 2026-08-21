export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function createError(
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): AppError {
  return new AppError(statusCode, code, message, details);
}

export function sendErrorResponse(
  res: { status: (statusCode: number) => { json: (payload: unknown) => unknown } },
  error: AppError | Error | { statusCode?: number; code?: string; message?: string; details?: unknown },
): unknown {
  const apiError =
    error instanceof AppError
      ? error
      : {
          statusCode: typeof (error as { statusCode?: number }).statusCode === "number" ? (error as { statusCode: number }).statusCode : 500,
          code: typeof (error as { code?: string }).code === "string" ? (error as { code: string }).code : "INTERNAL_SERVER_ERROR",
          message: typeof (error as { message?: string }).message === "string" ? (error as { message: string }).message : "Internal server error",
          details: typeof (error as { details?: unknown }).details === "undefined" ? undefined : (error as { details?: unknown }).details,
        };

  return res.status(apiError.statusCode).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details !== undefined ? { details: apiError.details } : {}),
    },
  });
}
