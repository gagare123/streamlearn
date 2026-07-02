import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

// ──────────────────────────────────────────────── ENUMS ──────────────────────

export const userRoleEnum = pgEnum('user_role', ['ADMIN', 'TUTOR', 'STUDENT'])

export const courseStatusEnum = pgEnum('course_status', [
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED',
])

export const enrollmentStatusEnum = pgEnum('enrollment_status', [
  'ACTIVE',
  'COMPLETED',
  'REFUNDED',
])

export const paymentStatusEnum = pgEnum('payment_status', [
  'PENDING',
  'SUCCESS',
  'FAILED',
  'REFUNDED',
])

export const muxAssetStatusEnum = pgEnum('mux_asset_status', [
  'WAITING',
  'PREPARING',
  'READY',
  'ERRORED',
])

export const notificationTypeEnum = pgEnum('notification_type', [
  'ENROLLMENT',
  'PAYMENT',
  'QUIZ_RESULT',
  'CERTIFICATE',
  'COURSE_UPDATE',
  'SYSTEM',
])

// ──────────────────────────────────────────────── TIMESTAMP HELPER ───────────

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}

// ──────────────────────────────────────────────── USERS ──────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 320 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull().default('STUDENT'),
    name: varchar('name', { length: 255 }).notNull(),
    avatarR2Key: text('avatar_r2_key'),
    bio: text('bio'),
    emailVerified: boolean('email_verified').notNull().default(false),
    verificationToken: text('verification_token'),
    verificationTokenExpiresAt: timestamp('verification_token_expires_at', {
      withTimezone: true,
    }),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_email_idx').on(t.email),
    index('users_role_idx').on(t.role),
    index('users_is_active_idx').on(t.isActive),
  ],
)

// ──────────────────────────────────────────────── SESSIONS ───────────────────

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    tokenId: uuid('token_id').notNull().defaultRandom(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    uniqueIndex('sessions_token_id_idx').on(t.tokenId),
    uniqueIndex('sessions_token_hash_idx').on(t.tokenHash),  // ← added
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
)

// ──────────────────────────────────────────────── PASSWORD RESET TOKENS ─────

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index('password_reset_tokens_user_idx').on(t.userId),
    uniqueIndex('password_reset_tokens_hash_idx').on(t.tokenHash),
  ],
)

// ──────────────────────────────────────────────── COURSES ────────────────────

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tutorId: uuid('tutor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 300 }).notNull(),
    description: text('description'),
    thumbnailR2Key: text('thumbnail_r2_key'),
    priceKobo: integer('price_kobo').notNull().default(0),
    status: courseStatusEnum('status').notNull().default('DRAFT'),
    level: varchar('level', { length: 50 }).notNull().default('BEGINNER'),
    tags: text('tags').array().notNull().default(sql`ARRAY[]::text[]`),
    totalLessons: integer('total_lessons').notNull().default(0),
    totalDurationSeconds: integer('total_duration_seconds').notNull().default(0),
    totalEnrollments: integer('total_enrollments').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('courses_slug_idx').on(t.slug),
    index('courses_tutor_id_idx').on(t.tutorId),
    index('courses_status_idx').on(t.status),
    index('courses_level_idx').on(t.level),
  ],
)

// ──────────────────────────────────────────────── COURSE SECTIONS ────────────

export const courseSections = pgTable(
  'course_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index('course_sections_course_id_idx').on(t.courseId),
    index('course_sections_position_idx').on(t.courseId, t.position),
  ],
)

// ──────────────────────────────────────────────── LESSONS ────────────────────

export const lessons = pgTable(
  'lessons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => courseSections.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    position: integer('position').notNull().default(0),
    muxUploadId: text('mux_upload_id'),
    muxAssetId: text('mux_asset_id'),
    muxPlaybackId: text('mux_playback_id'),
    muxAssetStatus: muxAssetStatusEnum('mux_asset_status')
      .notNull()
      .default('WAITING'),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    isFreePreview: boolean('is_free_preview').notNull().default(false),
    attachmentR2Key: text('attachment_r2_key'),
    ...timestamps,
  },
  (t) => [
    index('lessons_section_id_idx').on(t.sectionId),
    index('lessons_mux_upload_id_idx').on(t.muxUploadId),
    index('lessons_mux_asset_id_idx').on(t.muxAssetId),
    index('lessons_position_idx').on(t.sectionId, t.position),
  ],
)

// ──────────────────────────────────────────────── ENROLLMENTS ────────────────

export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    status: enrollmentStatusEnum('status').notNull().default('ACTIVE'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('enrollments_student_course_idx').on(t.studentId, t.courseId),
    index('enrollments_course_id_idx').on(t.courseId),
    index('enrollments_status_idx').on(t.status),
  ],
)

// ──────────────────────────────────────────────── LESSON PROGRESS ───────────

export const lessonProgress = pgTable(
  'lesson_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    watchedSeconds: integer('watched_seconds').notNull().default(0),
    isCompleted: boolean('is_completed').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('lesson_progress_student_lesson_idx').on(
      t.studentId,
      t.lessonId,
    ),
    index('lesson_progress_student_id_idx').on(t.studentId),
    index('lesson_progress_lesson_id_idx').on(t.lessonId),
  ],
)

// ──────────────────────────────────────────────── PAYMENTS ───────────────────

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    amountKobo: integer('amount_kobo').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('NGN'),
    paystackRef: varchar('paystack_ref', { length: 255 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull(),
    status: paymentStatusEnum('status').notNull().default('PENDING'),
    paystackMetadata: jsonb('paystack_metadata'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('payments_paystack_ref_idx').on(t.paystackRef),
    uniqueIndex('payments_idempotency_key_idx').on(t.idempotencyKey),
    index('payments_student_id_idx').on(t.studentId),
    index('payments_course_id_idx').on(t.courseId),
    index('payments_status_idx').on(t.status),
  ],
)

// ──────────────────────────────────────────────── QUIZZES ────────────────────

export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    timeLimitSeconds: integer('time_limit_seconds'),
    passMark: integer('pass_mark').notNull().default(70),
    maxAttempts: integer('max_attempts').notNull().default(3),
    isPublished: boolean('is_published').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('quizzes_course_id_idx').on(t.courseId),
    index('quizzes_is_published_idx').on(t.isPublished),
  ],
)

// ──────────────────────────────────────────────── QUIZ QUESTIONS ─────────────

export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    options: jsonb('options').$type<string[]>().notNull(),
    correctIndex: integer('correct_index').notNull(),
    explanation: text('explanation'),
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index('quiz_questions_quiz_id_idx').on(t.quizId),
    index('quiz_questions_position_idx').on(t.quizId, t.position),
  ],
)

// ──────────────────────────────────────────────── QUIZ SUBMISSIONS ───────────

export const quizSubmissions = pgTable(
  'quiz_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    answers: jsonb('answers').$type<Record<string, number>>().notNull(),
    score: integer('score').notNull().default(0),
    passed: boolean('passed').notNull().default(false),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }),
    attemptNumber: integer('attempt_number').notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index('quiz_submissions_student_id_idx').on(t.studentId),
    index('quiz_submissions_quiz_id_idx').on(t.quizId),
    index('quiz_submissions_student_quiz_idx').on(t.studentId, t.quizId),
  ],
)

// ──────────────────────────────────────────────── CERTIFICATES ───────────────

export const certificates = pgTable(
  'certificates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    pdfR2Key: text('pdf_r2_key').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('certificates_student_course_idx').on(t.studentId, t.courseId),
    index('certificates_student_id_idx').on(t.studentId),
  ],
)

// ──────────────────────────────────────────────── NOTIFICATIONS ──────────────

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    actionUrl: text('action_url'),
    readAt: timestamp('read_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('notifications_user_id_idx').on(t.userId),
    index('notifications_is_read_idx').on(t.userId, t.isRead),
    index('notifications_created_at_idx').on(t.createdAt),
  ],
)

// ──────────────────────────────────────────────── AUDIT LOGS ─────────────────

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: varchar('action', { length: 100 }).notNull(),
    targetType: varchar('target_type', { length: 100 }),
    targetId: uuid('target_id'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index('audit_logs_actor_id_idx').on(t.actorId),
    index('audit_logs_action_idx').on(t.action),
    index('audit_logs_target_idx').on(t.targetType, t.targetId),
    index('audit_logs_created_at_idx').on(t.createdAt),
  ],
)

// ──────────────────────────────────────────────── RELATIONS ──────────────────

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  coursesAsTutor: many(courses),
  enrollments: many(enrollments),
  lessonProgress: many(lessonProgress),
  quizSubmissions: many(quizSubmissions),
  notifications: many(notifications),
  certificates: many(certificates),
  payments: many(payments),
  auditLogsAsActor: many(auditLogs),
  passwordResetTokens: many(passwordResetTokens), // added
}))

export const coursesRelations = relations(courses, ({ one, many }) => ({
  tutor: one(users, { fields: [courses.tutorId], references: [users.id] }),
  sections: many(courseSections),
  enrollments: many(enrollments),
  certificates: many(certificates),
  payments: many(payments),
  quizzes: many(quizzes),
}))

export const courseSectionsRelations = relations(
  courseSections,
  ({ one, many }) => ({
    course: one(courses, {
      fields: [courseSections.courseId],
      references: [courses.id],
    }),
    lessons: many(lessons),
  }),
)

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  section: one(courseSections, {
    fields: [lessons.sectionId],
    references: [courseSections.id],
  }),
  progress: many(lessonProgress),
}))

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  student: one(users, {
    fields: [enrollments.studentId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [enrollments.courseId],
    references: [courses.id],
  }),
}))

export const lessonProgressRelations = relations(
  lessonProgress,
  ({ one }) => ({
    student: one(users, {
      fields: [lessonProgress.studentId],
      references: [users.id],
    }),
    lesson: one(lessons, {
      fields: [lessonProgress.lessonId],
      references: [lessons.id],
    }),
  }),
)

export const paymentsRelations = relations(payments, ({ one }) => ({
  student: one(users, {
    fields: [payments.studentId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [payments.courseId],
    references: [courses.id],
  }),
}))

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  course: one(courses, {
    fields: [quizzes.courseId],
    references: [courses.id],
  }),
  questions: many(quizQuestions),
  submissions: many(quizSubmissions),
}))

export const quizQuestionsRelations = relations(quizQuestions, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [quizQuestions.quizId],
    references: [quizzes.id],
  }),
}))

export const quizSubmissionsRelations = relations(
  quizSubmissions,
  ({ one }) => ({
    student: one(users, {
      fields: [quizSubmissions.studentId],
      references: [users.id],
    }),
    quiz: one(quizzes, {
      fields: [quizSubmissions.quizId],
      references: [quizzes.id],
    }),
  }),
)

export const certificatesRelations = relations(certificates, ({ one }) => ({
  student: one(users, {
    fields: [certificates.studentId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [certificates.courseId],
    references: [courses.id],
  }),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}))

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [auditLogs.actorId],
    references: [users.id],
  }),
}))

export const passwordResetTokensRelations = relations(
  passwordResetTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordResetTokens.userId],
      references: [users.id],
    }),
  }),
)

// ──────────────────────────────────────────────── INFERRED TYPES ─────────────

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert

export type Course = typeof courses.$inferSelect
export type NewCourse = typeof courses.$inferInsert

export type CourseSection = typeof courseSections.$inferSelect
export type NewCourseSection = typeof courseSections.$inferInsert

export type Lesson = typeof lessons.$inferSelect
export type NewLesson = typeof lessons.$inferInsert

export type Enrollment = typeof enrollments.$inferSelect
export type NewEnrollment = typeof enrollments.$inferInsert

export type LessonProgress = typeof lessonProgress.$inferSelect
export type NewLessonProgress = typeof lessonProgress.$inferInsert

export type Payment = typeof payments.$inferSelect
export type NewPayment = typeof payments.$inferInsert

export type Quiz = typeof quizzes.$inferSelect
export type NewQuiz = typeof quizzes.$inferInsert

export type QuizQuestion = typeof quizQuestions.$inferSelect
export type NewQuizQuestion = typeof quizQuestions.$inferInsert

export type QuizSubmission = typeof quizSubmissions.$inferSelect
export type NewQuizSubmission = typeof quizSubmissions.$inferInsert

export type Certificate = typeof certificates.$inferSelect
export type NewCertificate = typeof certificates.$inferInsert

export type Notification = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert

export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert

export type UserRole = (typeof userRoleEnum.enumValues)[number]
export type CourseStatus = (typeof courseStatusEnum.enumValues)[number]
export type EnrollmentStatus = (typeof enrollmentStatusEnum.enumValues)[number]
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number]
export type MuxAssetStatus = (typeof muxAssetStatusEnum.enumValues)[number]
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number]

