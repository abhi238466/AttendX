
import 'dotenv/config'
import { Resend } from 'resend'

const resendApiKey = process.env.RESEND_API_KEY

if (!resendApiKey) {
  throw new Error('RESEND_API_KEY is missing from backend/.env')
}

const resend = new Resend(resendApiKey)

export async function sendOtpEmail({ to, otp, purpose }) {
  const isRegistration = purpose === 'registration'

  const subject = isRegistration
    ? 'Verify your AttendX administrator email'
    : 'Your AttendX password reset OTP'

  const heading = isRegistration
    ? 'Verify your email'
    : 'Reset your password'

  const text = `Your AttendX verification code is ${otp}. It expires in 5 minutes. If you did not request this code, you can ignore this email.`

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#252344;background:#ffffff">
      <div style="font-size:25px;font-weight:bold;color:#6851e8">AttendX</div>
      <h2 style="margin-top:28px">${heading}</h2>
      <p>Use this one-time verification code to continue:</p>
      <div style="padding:18px;background:#f3f0ff;border-radius:12px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px;color:#6048dc">
        ${otp}
      </div>
      <p>This code expires in <strong>5 minutes</strong>.</p>
      <p>If you did not request this code, please ignore this email.</p>
      <hr style="border:none;border-top:1px solid #eeeeee;margin-top:28px" />
      <p style="font-size:12px;color:#777777">AttendX Smart Attendance</p>
    </div>
  `

  const { data, error } = await resend.emails.send({
    from: 'AttendX <onboarding@resend.dev>',
    to: [to],
    subject,
    html,
    text,
  })

  if (error) {
    console.error('Resend email error:', error.message)
    throw new Error('Unable to send verification email.')
  }

  return data
}
