// ─────────────────────────────────────────────────────────────────────────────
// Email HTML Templates — inline CSS only, works in Gmail/Outlook/Apple Mail
// ─────────────────────────────────────────────────────────────────────────────

const BTN = 'display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600'
const CARD = 'max-width:520px;margin:40px auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;padding:40px'
const BODY = 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f9fafb;margin:0;padding:0'

function base(content: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:20px 16px"><tr><td>
<table width="100%" style="${CARD}"><tr><td>
<div style="margin-bottom:20px"><span style="background:#eef2ff;color:#4f46e5;padding:6px 14px;border-radius:999px;font-size:13px;font-weight:600">StreamLearn</span></div>
${content}
<hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb">
<p style="margin:0;color:#9ca3af;font-size:12px">StreamLearn &mdash; Nigerian University E-Learning.<br>If you did not expect this email, you can safely ignore it.</p>
</td></tr></table></td></tr></table>
</body></html>`
}

export type EmailTemplate = { subject: string; html: string; text: string }

export function enrollmentConfirmedEmail(p: { name: string; courseTitle: string; courseUrl: string }): EmailTemplate {
  return {
    subject: `You're enrolled: ${p.courseTitle}`,
    html: base(`<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">Enrollment Confirmed</h1>
<p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6">Hi ${p.name}, you are now enrolled in <strong>${p.courseTitle}</strong>.</p>
<a href="${p.courseUrl}" style="${BTN}">Start Learning</a>`),
    text: `Hi ${p.name},\n\nYou are now enrolled in "${p.courseTitle}".\n\nStart learning: ${p.courseUrl}\n\nStreamLearn`,
  }
}

export function paymentSuccessEmail(p: { name: string; courseTitle: string; amountNaira: string; reference: string; courseUrl: string }): EmailTemplate {
  return {
    subject: `Payment confirmed: ${p.courseTitle}`,
    html: base(`<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">Payment Successful</h1>
<p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6">Hi ${p.name}, your payment of <strong>${p.amountNaira}</strong> for <strong>${p.courseTitle}</strong> was received.</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:24px">
<tr><td style="padding:8px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6">Course</td><td style="padding:8px 0;color:#111827;font-size:13px;text-align:right;border-bottom:1px solid #f3f4f6">${p.courseTitle}</td></tr>
<tr><td style="padding:8px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6">Amount</td><td style="padding:8px 0;color:#111827;font-size:13px;text-align:right;border-bottom:1px solid #f3f4f6">${p.amountNaira}</td></tr>
<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Reference</td><td style="padding:8px 0;color:#111827;font-size:13px;text-align:right;font-family:monospace">${p.reference}</td></tr>
</table>
<a href="${p.courseUrl}" style="${BTN}">Go to Course</a>`),
    text: `Hi ${p.name},\n\nPayment confirmed!\n\nCourse: ${p.courseTitle}\nAmount: ${p.amountNaira}\nRef: ${p.reference}\n\nStart learning: ${p.courseUrl}\n\nStreamLearn`,
  }
}

export function quizResultEmail(p: { name: string; quizTitle: string; score: number; passed: boolean; passMark: number; quizUrl: string }): EmailTemplate {
  const colour = p.passed ? '#16a34a' : '#dc2626'
  const status = p.passed ? 'Passed' : 'Not Passed'
  return {
    subject: `Quiz result: ${p.score}% on "${p.quizTitle}"`,
    html: base(`<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">Quiz Result</h1>
<p style="margin:0 0 20px;color:#6b7280;font-size:15px">Hi ${p.name}, here are your results for <strong>${p.quizTitle}</strong>.</p>
<div style="text-align:center;padding:28px;background:#f9fafb;border-radius:10px;margin-bottom:24px">
<p style="margin:0;font-size:48px;font-weight:800;color:${colour}">${p.score}%</p>
<p style="margin:4px 0 0;font-size:14px;font-weight:600;color:${colour}">${status}</p>
<p style="margin:4px 0 0;font-size:12px;color:#9ca3af">Pass mark: ${p.passMark}%</p>
</div>
<a href="${p.quizUrl}" style="${BTN}">View Results</a>`),
    text: `Hi ${p.name},\n\nQuiz: "${p.quizTitle}"\nScore: ${p.score}%  Status: ${status}  Pass mark: ${p.passMark}%\n\nView: ${p.quizUrl}\n\nStreamLearn`,
  }
}

export function certificateIssuedEmail(p: { name: string; courseTitle: string; certificateUrl: string }): EmailTemplate {
  return {
    subject: `Your certificate is ready: ${p.courseTitle}`,
    html: base(`<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">Certificate Issued</h1>
<p style="margin:0 0 20px;color:#6b7280;font-size:15px">Congratulations, ${p.name}! You completed <strong>${p.courseTitle}</strong>.</p>
<a href="${p.certificateUrl}" style="${BTN}">Download Certificate</a>`),
    text: `Congratulations, ${p.name}!\n\nCertificate for "${p.courseTitle}" is ready.\n\nDownload: ${p.certificateUrl}\n\nStreamLearn`,
  }
}

export function verificationEmail(p: { name: string; verifyUrl: string }): EmailTemplate {
  return {
    subject: 'Verify your StreamLearn account',
    html: base(`<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">Verify your email</h1>
<p style="margin:0 0 24px;color:#6b7280;font-size:15px">Hi ${p.name}, click below to verify your email and activate your account.</p>
<a href="${p.verifyUrl}" style="${BTN}">Verify Email Address</a>
<p style="margin:20px 0 0;color:#9ca3af;font-size:13px">Link expires in 24 hours.</p>`),
    text: `Hi ${p.name},\n\nVerify your email: ${p.verifyUrl}\n\nExpires in 24 hours.\n\nStreamLearn`,
  }
}

export function passwordResetEmail(p: { name: string; resetUrl: string }): EmailTemplate {
  return {
    subject: 'Reset your StreamLearn password',
    html: base(`<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">Reset your password</h1>
<p style="margin:0 0 24px;color:#6b7280;font-size:15px">Hi ${p.name}, click below to choose a new password.</p>
<a href="${p.resetUrl}" style="${BTN}">Reset Password</a>
<p style="margin:20px 0 0;color:#9ca3af;font-size:13px">Link expires in 1 hour. If you did not request this, ignore the email.</p>`),
    text: `Hi ${p.name},\n\nReset your password: ${p.resetUrl}\n\nExpires in 1 hour.\n\nStreamLearn`,
  }
}