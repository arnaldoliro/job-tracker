import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  issues?: unknown;
  path: string;
  timestamp: string;
}

/**
 * Dá um formato único a todo erro que sai da API. Sem isso cada exceção
 * responde num shape diferente e o frontend vira uma coleção de casos
 * especiais para ler mensagem de erro.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload = isHttp ? exception.getResponse() : null;
    const details =
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)
        : {};

    // Erro inesperado: registra o stack no log e devolve mensagem genérica.
    // Detalhe interno (query, caminho de arquivo) não vai para o cliente.
    if (!isHttp) {
      this.logger.error(
        `Erro não tratado em ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorBody = {
      statusCode: status,
      error:
        typeof details.error === 'string'
          ? details.error
          : httpStatusName(status),
      message:
        typeof payload === 'string'
          ? payload
          : typeof details.message === 'string'
            ? details.message
            : 'Erro interno',
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (details.issues !== undefined) {
      body.issues = details.issues;
    }

    response.status(status).json(body);
  }
}

/** 400 -> "Bad Request". Fallback quando a exceção não trouxe um `error`. */
function httpStatusName(status: number): string {
  const name = HttpStatus[status];

  if (typeof name !== 'string') {
    return 'Error';
  }

  return name
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
