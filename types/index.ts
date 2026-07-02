import type { Role } from "@/lib/constants";

export interface JwtAccessPayload {
  sub:    string;
  email:  string;
  role:   Role;
  iat?:   number;
  exp?:   number;
}

export interface JwtRefreshPayload {
  sub:  string;
  jti:  string;
  iat?: number;
  exp?: number;
}

export interface AuthContext {
  userId: string;
  email:  string;
  role:   Role;
}

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data:    T;
}

export interface ApiError {
  success: false;
  message: string;
  code?:   string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface EmailJob {
  to:       string;
  subject:  string;
  html:     string;
  text?:    string;
}

export interface NotificationJob {
  userId:   string;
  title:    string;
  message:  string;
  link?:    string;
}

export interface SseEvent {
  type:       string;
  payload:    unknown;
  timestamp:  string;
}