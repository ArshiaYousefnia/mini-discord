import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mini_discord.settings')
app = Celery('mini_discord')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()