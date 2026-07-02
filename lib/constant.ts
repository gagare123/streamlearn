export const AUTH = {
  ACCESS_TOKEN_COOKIE:         "sl_access",
  REFRESH_TOKEN_COOKIE:        "sl_refresh",
  ACCESS_TOKEN_TTL_SECONDS:    60 * 15,
  REFRESH_TOKEN_TTL_SECONDS:   60 * 60 * 24 * 7,
  BCRYPT_ROUNDS:               12,
} as const;

export const RATE_LIMIT = {
  AUTH:    { requests: 5,   windowSeconds: 60 },
  API:     { requests: 100, windowSeconds: 60 },
  UPLOAD:  { requests: 10,  windowSeconds: 60 },
  PAYMENT: { requests: 3,   windowSeconds: 60 },
} as const;

export const ROLES = {
  ADMIN:   "ADMIN",
  TUTOR:   "TUTOR",
  STUDENT: "STUDENT",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const UPLOAD = {
  MAX_THUMBNAIL_SIZE_BYTES:  2   * 1024 * 1024,
  MAX_DOCUMENT_SIZE_BYTES:   10  * 1024 * 1024,
  PRESIGNED_URL_TTL_SECONDS: 300,
  ALLOWED_THUMBNAIL_TYPES:   ["image/jpeg", "image/png", "image/webp"],
  ALLOWED_DOCUMENT_TYPES:    ["application/pdf"],
} as const;

export const VIDEO = {
  PROGRESS_SAVE_INTERVAL_MS: 5000,
  COMPLETION_THRESHOLD:      0.9,
} as const;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 12,
  MAX_PAGE_SIZE:     50,
} as const;

export const PAYMENT = {
  CURRENCY:               "NGN",
  IDEMPOTENCY_TTL_SECONDS: 86400,
} as const;
