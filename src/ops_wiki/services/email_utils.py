'''
邮件通知工具：从 Flask 配置读取 SMTP 参数，未配置时降级为日志记录。
'''
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


# 从 Flask 配置里读取 SMTP 参数
def _get_smtp_config(app):
    return {
        'server': app.config.get('MAIL_SERVER', ''),
        'port': app.config.get('MAIL_PORT', 587),
        'username': app.config.get('MAIL_USERNAME', ''),
        'password': app.config.get('MAIL_PASSWORD', ''),
        'sender': app.config.get('MAIL_SENDER', 'noreply@ops-wiki.local'),
    }


# 发送通知邮件，SMTP 不可用时降级为日志记录
def send_notification(to_email: str, subject: str, body: str, app=None) -> bool:
    if app is None:
        from flask import current_app as flask_app
        app = flask_app

    cfg = _get_smtp_config(app)

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
