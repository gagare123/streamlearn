import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib'
import { getR2Client, R2Keys } from './r2'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { env } from './env'

// ─────────────────────────────────────────────────────────────────────────────
// Certificate Generator
//
// Generates a PDF certificate using pdf-lib (pure JS — no Chromium needed).
// Uploads to Cloudflare R2 and returns the object key.
// ─────────────────────────────────────────────────────────────────────────────

export type CertificateData = {
  certificateId:  string
  studentName:    string
  courseTitle:    string
  tutorName:      string
  completedAt:    Date
  courseDuration: string   // e.g. "4h 30m"
}

/**
 * Generate a PDF certificate and upload it to R2.
 * Returns the R2 object key.
 */
export async function generateCertificate(data: CertificateData): Promise<string> {
  const pdfBytes = await buildPdf(data)

  const key = R2Keys.certificate(data.certificateId)
  const r2  = getR2Client()

  await r2.send(new PutObjectCommand({
    Bucket:      env.R2_BUCKET_NAME,
    Key:         key,
    Body:        Buffer.from(pdfBytes),
    ContentType: 'application/pdf',
    Metadata: {
      'certificate-id': data.certificateId,
      'student-name':   data.studentName,
      'course-title':   data.courseTitle,
    },
  }))

  return key
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF builder
// ─────────────────────────────────────────────────────────────────────────────

async function buildPdf(data: CertificateData): Promise<Uint8Array> {
  const doc  = await PDFDocument.create()
  const page = doc.addPage([842, 595])  // A4 landscape

  const { width, height } = page.getSize()

  // ── Fonts ─────────────────────────────────────────────────────────────────
  const fontBold    = await doc.embedFont(StandardFonts.HelveticaBold)
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica)
  const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique)

  // ── Colours ───────────────────────────────────────────────────────────────
  const indigo   = rgb(0.306, 0.275, 0.898)   // #4f46e5
  const darkGray = rgb(0.071, 0.071, 0.071)   // #111111
  const midGray  = rgb(0.420, 0.420, 0.420)   // #6b6b6b
  const lightBg  = rgb(0.973, 0.976, 0.988)   // #f8f9fc
  const gold     = rgb(0.808, 0.659, 0.176)   // #cead2d
  const white    = rgb(1, 1, 1)

  // ── Background ────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width, height, color: white })

  // Left accent bar
  page.drawRectangle({ x: 0, y: 0, width: 12, height, color: indigo })

  // Top accent bar
  page.drawRectangle({ x: 12, y: height - 8, width: width - 12, height: 8, color: indigo })

  // Subtle background panel
  page.drawRectangle({ x: 40, y: 60, width: width - 80, height: height - 130, color: lightBg, opacity: 0.5 })

  // ── Watermark ─────────────────────────────────────────────────────────────
  page.drawText('STREAMLEARN', {
    x: 120, y: 220,
    size: 90,
    font: fontBold,
    color: rgb(0.9, 0.9, 0.95),
    rotate: degrees(15),
    opacity: 0.08,
  })

  // ── Header: StreamLearn brand ─────────────────────────────────────────────
  page.drawText('StreamLearn', {
    x: 60, y: height - 55,
    size: 18, font: fontBold, color: indigo,
  })
  page.drawText('Nigerian University E-Learning Platform', {
    x: 60, y: height - 72,
    size: 9, font: fontRegular, color: midGray,
  })

  // Decorative gold line
  page.drawLine({
    start: { x: 60, y: height - 85 },
    end:   { x: width - 60, y: height - 85 },
    thickness: 1.5, color: gold,
  })

  // ── Main heading ──────────────────────────────────────────────────────────
  const heading = 'CERTIFICATE OF COMPLETION'
  const headingSize = 26
  const headingWidth = fontBold.widthOfTextAtSize(heading, headingSize)
  page.drawText(heading, {
    x: (width - headingWidth) / 2,
    y: height - 145,
    size: headingSize, font: fontBold, color: darkGray,
  })

  // Subtitle
  const subtitle = 'This is to certify that'
  const subtitleWidth = fontOblique.widthOfTextAtSize(subtitle, 13)
  page.drawText(subtitle, {
    x: (width - subtitleWidth) / 2,
    y: height - 178,
    size: 13, font: fontOblique, color: midGray,
  })

  // ── Student name ──────────────────────────────────────────────────────────
  const nameFontSize = 36
  const nameWidth = fontBold.widthOfTextAtSize(data.studentName, nameFontSize)
  page.drawText(data.studentName, {
    x: (width - nameWidth) / 2,
    y: height - 228,
    size: nameFontSize, font: fontBold, color: indigo,
  })

  // Underline the name
  page.drawLine({
    start: { x: (width - nameWidth) / 2, y: height - 238 },
    end:   { x: (width + nameWidth) / 2, y: height - 238 },
    thickness: 1, color: gold,
  })

  // ── Body text ─────────────────────────────────────────────────────────────
  const bodyLines = [
    'has successfully completed the course',
  ]
  for (const [i, line] of bodyLines.entries()) {
    const lw = fontRegular.widthOfTextAtSize(line, 13)
    page.drawText(line, {
      x: (width - lw) / 2,
      y: height - 268 - i * 20,
      size: 13, font: fontRegular, color: midGray,
    })
  }

  // ── Course title ──────────────────────────────────────────────────────────
  const courseFontSize = 22
  const courseWidth = fontBold.widthOfTextAtSize(data.courseTitle, courseFontSize)
  // Wrap if too wide
  const maxCourseWidth = width - 120
  if (courseWidth > maxCourseWidth) {
    // Split into two lines
    const words = data.courseTitle.split(' ')
    const mid   = Math.ceil(words.length / 2)
    const line1 = words.slice(0, mid).join(' ')
    const line2 = words.slice(mid).join(' ')
    const l1w = fontBold.widthOfTextAtSize(line1, courseFontSize)
    const l2w = fontBold.widthOfTextAtSize(line2, courseFontSize)
    page.drawText(line1, { x: (width - l1w) / 2, y: height - 305, size: courseFontSize, font: fontBold, color: darkGray })
    page.drawText(line2, { x: (width - l2w) / 2, y: height - 333, size: courseFontSize, font: fontBold, color: darkGray })
  } else {
    page.drawText(data.courseTitle, {
      x: (width - courseWidth) / 2,
      y: height - 310,
      size: courseFontSize, font: fontBold, color: darkGray,
    })
  }

  // ── Completion date ───────────────────────────────────────────────────────
  const dateStr = data.completedAt.toLocaleDateString('en-NG', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  const dateText = `Completed on ${dateStr}`
  const dateWidth = fontRegular.widthOfTextAtSize(dateText, 11)
  page.drawText(dateText, {
    x: (width - dateWidth) / 2,
    y: height - 365,
    size: 11, font: fontRegular, color: midGray,
  })

  // Duration
  if (data.courseDuration) {
    const durText  = `Course duration: ${data.courseDuration}`
    const durWidth = fontRegular.widthOfTextAtSize(durText, 10)
    page.drawText(durText, {
      x: (width - durWidth) / 2,
      y: height - 382,
      size: 10, font: fontRegular, color: midGray,
    })
  }

  // ── Bottom divider ────────────────────────────────────────────────────────
  page.drawLine({
    start: { x: 60, y: 130 },
    end:   { x: width - 60, y: 130 },
    thickness: 1, color: rgb(0.85, 0.85, 0.90),
  })

  // ── Signature areas ───────────────────────────────────────────────────────
  // Left: Tutor
  page.drawLine({ start: { x: 80, y: 105 }, end: { x: 260, y: 105 }, thickness: 0.8, color: midGray })
  page.drawText(data.tutorName, {
    x: 80, y: 90, size: 10, font: fontBold, color: darkGray,
  })
  page.drawText('Course Instructor', {
    x: 80, y: 76, size: 9, font: fontRegular, color: midGray,
  })

  // Right: StreamLearn
  page.drawLine({ start: { x: width - 260, y: 105 }, end: { x: width - 80, y: 105 }, thickness: 0.8, color: midGray })
  page.drawText('StreamLearn', {
    x: width - 260, y: 90, size: 10, font: fontBold, color: indigo,
  })
  page.drawText('E-Learning Platform', {
    x: width - 260, y: 76, size: 9, font: fontRegular, color: midGray,
  })

  // ── Certificate ID footer ─────────────────────────────────────────────────
  page.drawText(`Certificate ID: ${data.certificateId}`, {
    x: 60, y: 30,
    size: 8, font: fontRegular, color: rgb(0.70, 0.70, 0.75),
  })

  const verifyUrl = `${env.NEXT_PUBLIC_APP_URL}/verify/${data.certificateId}`
  page.drawText(`Verify at: ${verifyUrl}`, {
    x: 60, y: 18,
    size: 8, font: fontRegular, color: rgb(0.70, 0.70, 0.75),
  })

  return doc.save()
}