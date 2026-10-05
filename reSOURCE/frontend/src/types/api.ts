/** Response body of `GET /api/health`. */
export interface HealthResponse {
  status: string;
  service: string;
}

/** Error body returned by the API when a request fails. */
export interface ApiErrorBody {
  status?: number;
  error?: string;
  message?: string;
  /** Field level validation messages, keyed by field name. */
  errors?: Record<string, string>;
  timestamp?: string;
  path?: string;
}
