import { db, courses } from '@db/index'
import { eq } from 'drizzle-orm'
import { slugify } from './utils'

/**
 * Generate a URL-safe slug from a course title.
 * Appends a numeric suffix if the base slug is already taken.
 *
 * Examples:
 *   "Introduction to Python" → "introduction-to-python"
 *   (if taken)              → "introduction-to-python-2"
 *   (if taken)              → "introduction-to-python-3"
 */
export async function generateUniqueSlug(title: string): Promise<string> {
  const base = slugify(title)

  // Check if the base slug is available
  const [existing] = await db
    .select({ slug: courses.slug })
    .from(courses)
    .where(eq(courses.slug, base))
    .limit(1)

  if (!existing) return base

  // Find the next available numeric suffix
  let suffix = 2
  while (true) {
    const candidate = `${base}-${suffix}`
    const [conflict] = await db
      .select({ slug: courses.slug })
      .from(courses)
      .where(eq(courses.slug, candidate))
      .limit(1)

    if (!conflict) return candidate
    suffix++
    if (suffix > 999) {
      // Safety valve — should never happen in practice
      return `${base}-${Date.now()}`
    }
  }
}