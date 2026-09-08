import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings


def send_password_reset_email(
    to_email: str,
    reset_token: str,
    user_name: str,
    frontend_url: str,
) -> None:
    if not settings.smtp_host:
        raise RuntimeError(
            "Email service not configured. Set SMTP_HOST in environment variables."
        )

    reset_url = f"{frontend_url}/reset-password?token={reset_token}"

    plain_text = (
        f"Hi {user_name},\n\n"
        f"You requested a password reset for your Inkira account.\n\n"
        f"Reset your password here:\n{reset_url}\n\n"
        f"This link expires in 1 hour.\n\n"
        f"If you didn't request this, you can safely ignore this email.\n\n"
        f"- The Inkira Team"
    )

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#f97316;padding:32px;text-align:center;">
            <div style="width:48px;height:48px;background:rgba(255,255,255,0.2);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
              <span style="font-size:24px;">🤖</span>
            </div>
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Inkira</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px 32px;">
            <h2 style="margin:0 0 8px;color:#18181b;font-size:20px;font-weight:600;">Reset Your Password</h2>
            <p style="margin:0 0 24px;color:#71717a;font-size:14px;line-height:1.6;">
              Hi {user_name},<br><br>
              You requested a password reset for your Inkira account. Click the button below to set a new password.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 32px;">
                  <a href="{reset_url}"
                     style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px;">
                    Reset Password
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;color:#71717a;font-size:13px;line-height:1.6;">
              This link expires in <strong style="color:#18181b;">1 hour</strong>.
            </p>
            <p style="margin:0;color:#a1a1aa;font-size:13px;line-height:1.6;">
              If you didn't request a password reset, you can safely ignore this email. Your password won't change.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #f4f4f5;text-align:center;">
            <p style="margin:0;color:#a1a1aa;font-size:12px;">© 2025 Inkira. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Reset your Inkira password"
    msg["From"] = settings.smtp_from
    msg["To"] = to_email

    msg.attach(MIMEText(plain_text, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.ehlo()
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(settings.smtp_from, to_email, msg.as_string())
