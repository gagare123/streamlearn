export interface RegisterRequest {
  name:     string;
  email:    string;
  password: string;
  role:     "STUDENT" | "TUTOR";
}

export interface LoginRequest {
  email:    string;
  password: string;
}

export interface AuthUser {
  id:        string;
  name:      string;
  email:     string;
  role:      string;
  avatarUrl: string | null;
}

export interface CreateCourseRequest {
  title:        string;
  description:  string;
  price:        number;
  category:     string;
  level:        "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  thumbnailKey?: string;
}

export interface CourseListItem {
  id:           string;
  title:        string;
  description:  string;
  price:        number;
  category:     string;
  level:        string;
  thumbnailUrl: string | null;
  tutor:        { name: string; avatarUrl: string | null };
  _count:       { enrollments: number; lessons: number };
}

export interface InitiatePaymentRequest {
  courseId:       string;
  idempotencyKey: string;
}

export interface InitiatePaymentResponse {
  authorizationUrl: string;
  reference:        string;
}

export interface PresignRequest {
  filename:    string;
  contentType: string;
  size:        number;
}

export interface PresignResponse {
  uploadUrl: string;
  key:       string;
  expiresIn: number;
}