import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// ─── 404 Not Found ───────────────────────────────────────────────────────────

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error:   `Route nicht gefunden: ${req.method} ${req.originalUrl}`,
  });
}

// ─── Zentraler Error-Handler ─────────────────────────────────────────────────

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Bekannte App-Fehler
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error:   err.message,
      ...(env.NODE_ENV === 'development' && err.details ? { details: err.details } : {}),
    });
    return;
  }

  // Prisma-Fehler (unique constraint, not found, etc.)
  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as Error & { code?: string; meta?: unknown };

    if (prismaErr.code === 'P2002') {
      res.status(409).json({
        success: false,
        error:   'Datensatz existiert bereits (eindeutige Einschränkung verletzt)',
      });
      return;
    }

    if (prismaErr.code === 'P2025') {
      res.status(404).json({
        success: false,
        error:   'Datensatz nicht gefunden',
      });
      return;
    }
  }

  // Unbekannte Fehler — in Production keine Details
  console.error('Unbehandelter Fehler:', err);

  res.status(500).json({
    success: false,
    error:   'Interner Serverfehler',
    ...(env.NODE_ENV === 'development' ? { details: err.message } : {}),
  });
}
