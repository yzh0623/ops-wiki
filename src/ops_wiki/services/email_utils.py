'''
邮件通知工具：从 Flask 配置读取 SMTP 参数；未配置时降级为写日志。
Mail notifier: reads SMTP settings from the Flask config and falls back to
logging when they are absent.
'''
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


# 从 Flask 配置里读取 SMTP 参数
# Read the SMTP settings from the Flask config
def _get_smtp_config(app):
    return {
        'server': app.config.get('MAIL_SERVER', ''),
        'port': app.config.get('MAIL_PORT', 587),
        'username': app.config.get('MAIL_USERNAME', ''),
        'password': app.config.get('MAIL_PASSWORD', ''),
        'sender': app.config.get('MAIL_SENDER', 'noreply@ops-wiki.local'),
    }


# 发送通知邮件；SMTP 未配置或发送失败时只记日志，不抛异常
# Send a notification email; when SMTP is missing or fails, log instead of raising
def send_notification(to_email: str, subject: str, body: str, app=None) -> bool:
    if app is None:
        from flask import current_app as flask_app
        app = flask_app

    cfg = _get_smtp_config(app)

    # 未配置服务器地址 = 关闭邮件，仅写日志
    # No server configured means mail is off; just log it
    if not cfg['server']:
        logger.info('[EMAIL DISABLED] To: %s | Subj: %s | Body: %s',
                    to_email, subject, body[:200])
        return False

    try:
        msg = MIMEMultipart()
        msg['From'] = cfg['sender']
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain', 'utf-8'))

        # 465 走隐式 SSL，其余端口先连再 STARTTLS
        # Port 465 uses implicit SSL; other ports connect and then upgrade with STARTTLS
        if cfg['port'] == 465:
            server = smtplib.SMTP_SSL(cfg['server'], cfg['port'], timeout=10)
        else:
            server = smtplib.SMTP(cfg['server'], cfg['port'], timeout=10)
            server.starttls()

        if cfg['username']:
            server.login(cfg['username'], cfg['password'])
        server.sendmail(cfg['sender'], to_email, msg.as_string())
        server.quit()
        logger.info('[EMAIL SENT] To: %s | Subj: %s', to_email, subject)
        return True
    except Exception as e:
        logger.warning('[EMAIL FAILED] To: %s | Error: %s', to_email, e)
        return False
