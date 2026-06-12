"""Simple SMTP email sender for password reset and notifications."""
from __future__ import annotations

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import structlog

from app.core.config import settings

logger = structlog.get_logger(__name__)


def send_email(*, to: str, subject: str, html_body: str, text_body: str = "") -> bool:
    """Send an email via SMTP. Returns True on success, False otherwise.

    Silently skips if SMTP_USER is not configured (dev mode).
    """
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.info("email_skipped_no_smtp_config", to=to, subject=subject)
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"Future ERP <{settings.SMTP_FROM}>"
        msg["To"] = to

        if text_body:
            msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.sendmail(settings.SMTP_FROM, [to], msg.as_string())

        logger.info("email_sent", to=to, subject=subject)
        return True
    except Exception as exc:
        logger.warning("email_send_failed", to=to, subject=subject, error=str(exc))
        return False


def send_password_reset_email(*, to: str, reset_url: str, expires_minutes: int = 30) -> bool:
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#6d28d9;margin-bottom:8px">Password Reset</h2>
      <p style="color:#374151">We received a request to reset your password.
         Click the button below — this link expires in {expires_minutes} minutes.</p>
      <a href="{reset_url}"
         style="display:inline-block;margin:24px 0;background:#6d28d9;color:#fff;
                padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
        Reset Password
      </a>
      <p style="color:#6b7280;font-size:13px">
        If you did not request this, you can safely ignore this email.
      </p>
      <p style="color:#6b7280;font-size:13px">
        Or copy this link: <a href="{reset_url}" style="color:#6d28d9">{reset_url}</a>
      </p>
    </div>
    """
    text = f"Password reset link (expires in {expires_minutes} min): {reset_url}"
    return send_email(
        to=to,
        subject="Reset your Future ERP password",
        html_body=html,
        text_body=text,
    )
