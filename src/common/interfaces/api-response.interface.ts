export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
  meta?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
    total?: number;
  };
}
