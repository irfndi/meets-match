import { Request, Response, NextFunction } from 'express';
import { ApiResponse, ApiError } from '../types';

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;
  public details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

const handleDatabaseError = (error: any): AppError => {
  // PostgreSQL error codes
  switch (error.code) {
    case '23505': // unique_violation
      return new ConflictError('Resource already exists');
    case '23503': // foreign_key_violation
      return new ValidationError('Referenced resource does not exist');
    case '23502': // not_null_violation
      return new ValidationError('Required field is missing');
    case '23514': // check_violation
      return new ValidationError('Data validation failed');
    case '42P01': // undefined_table
      return new AppError('Database table not found', 500, 'DATABASE_ERROR');
    case '42703': // undefined_column
      return new AppError('Database column not found', 500, 'DATABASE_ERROR');
    default:
      return new AppError(
        'Database operation failed',
        500,
        'DATABASE_ERROR',
        process.env.NODE_ENV === 'development' ? error.message : undefined
      );
  }
};

const handleJWTError = (error: any): AppError => {
  if (error.name === 'JsonWebTokenError') {
    return new AuthenticationError('Invalid token');
  }
  if (error.name === 'TokenExpiredError') {
    return new AuthenticationError('Token expired');
  }
  if (error.name === 'NotBeforeError') {
    return new AuthenticationError('Token not active');
  }
  return new AuthenticationError('Token validation failed');
};

const handleValidationError = (error: any): AppError => {
  if (error.isJoi) {
    const details = error.details.map((detail: any) => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value
    }));
    return new ValidationError('Validation failed', details);
  }
  return new ValidationError(error.message);
};

const sendErrorDev = (error: AppError, res: Response): void => {
  const response: ApiResponse = {
    success: false,
    error: error.message,
    data: {
      code: error.code,
      statusCode: error.statusCode,
      stack: error.stack,
      details: error.details
    }
  };

  res.status(error.statusCode).json(response);
};

const sendErrorProd = (error: AppError, res: Response): void => {
  // Only send operational errors to client in production
  if (error.isOperational) {
    const response: ApiResponse = {
      success: false,
      error: error.message,
      data: {
        code: error.code,
        ...(error.details && { details: error.details })
      }
    };

    res.status(error.statusCode).json(response);
  } else {
    // Log the error for debugging
    console.error('ERROR 💥:', error);

    // Send generic message
    const response: ApiResponse = {
      success: false,
      error: 'Something went wrong',
      data: {
        code: 'INTERNAL_ERROR'
      }
    };

    res.status(500).json(response);
  }
};

export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let err = error;

  // Log error
  console.error('Error Handler:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Convert known errors to AppError
  if (error.name === 'CastError') {
    err = new ValidationError('Invalid ID format');
  } else if (error.code && typeof error.code === 'string' && error.code.startsWith('23')) {
    err = handleDatabaseError(error);
  } else if (error.name && error.name.includes('JWT')) {
    err = handleJWTError(error);
  } else if (error.isJoi || error.name === 'ValidationError') {
    err = handleValidationError(error);
  } else if (error.type === 'entity.parse.failed') {
    err = new ValidationError('Invalid JSON format');
  } else if (error.type === 'entity.too.large') {
    err = new ValidationError('Request payload too large');
  } else if (!(error instanceof AppError)) {
    err = new AppError(
      error.message || 'Something went wrong',
      error.statusCode || 500,
      error.code || 'INTERNAL_ERROR'
    );
  }

  // Send error response
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    sendErrorProd(err, res);
  }
};

// Async error wrapper
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};