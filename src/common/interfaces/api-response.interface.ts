export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
  message: string;
  meta?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  message: string;
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}
