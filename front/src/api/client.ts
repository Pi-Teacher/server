export interface ApiErrorEnvelope {
  error?: {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let csrfToken = '';
const unauthorizedListeners = new Set<() => void>();

export const setApiCSRFToken = (token: string) => {
  csrfToken = token;
};

export const onApiUnauthorized = (listener: () => void) => {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseResponseBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204) return null;
  const text = await response.text();
  if (text === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(response.status, 'invalid_response', '服务端返回了无法解析的响应');
  }
};

const toApiError = (response: Response, body: unknown): ApiError => {
  if (isRecord(body) && isRecord(body.error)) {
    const code = typeof body.error.code === 'string' ? body.error.code : 'request_failed';
    const message = typeof body.error.message === 'string' ? body.error.message : '请求失败';
    const details = isRecord(body.error.details) ? body.error.details : undefined;
    return new ApiError(response.status, code, message, details);
  }
  return new ApiError(response.status, 'request_failed', `请求失败 (${response.status})`);
};

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipUnauthorizedEvent?: boolean;
}

export const apiRequest = async <T>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }
  if (method !== 'GET' && method !== 'HEAD' && csrfToken !== '') {
    headers.set('X-CSRF-Token', csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      method,
      headers,
      body,
      credentials: 'same-origin'
    });
  } catch (error) {
    // React Query 通过 AbortSignal 取消已失去观察者的旧筛选请求. 保留 AbortError
    // 才能让它按取消处理, 避免把正常的 Topic 切换误报为网络错误.
    if (
      (error instanceof Error && error.name === 'AbortError') ||
      (isRecord(error) && error.name === 'AbortError')
    ) {
      throw error;
    }
    const message = error instanceof Error ? error.message : '无法连接服务端';
    throw new ApiError(0, 'network_error', message);
  }

  const responseBody = await parseResponseBody(response);
  if (!response.ok) {
    const apiError = toApiError(response, responseBody);
    if (response.status === 401 && !options.skipUnauthorizedEvent) {
      unauthorizedListeners.forEach((listener) => listener());
    }
    throw apiError;
  }
  return responseBody as T;
};

export const getApiErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return '发生未知错误';
};
