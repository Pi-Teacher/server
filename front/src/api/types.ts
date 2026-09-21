export interface SessionResponse {
  csrf_token: string;
  expires_at: string;
}

export interface PageResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface TopicResponse {
  id: number;
  name: string;
  description: string;
  card_count: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface HealthResponse {
  status: string;
}
