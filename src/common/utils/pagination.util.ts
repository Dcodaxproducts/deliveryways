import { QueryDto } from '../dto';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export const getPagination = (
  query: QueryDto,
): {
  skip: number;
  take: number;
} => {
  const skip = (query.page - 1) * query.limit;
  return {
    skip,
    take: query.limit,
  };
};

export const buildPaginationMeta = (
  query: QueryDto,
  total: number,
): PaginationMeta => {
  const totalPages = Math.ceil(total / query.limit) || 1;

  return {
    page: query.page,
    limit: query.limit,
    total,
    totalPages,
    hasNext: query.page < totalPages,
    hasPrevious: query.page > 1,
  };
};
