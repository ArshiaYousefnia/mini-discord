from celery import shared_task
from django.core.management import call_command

@shared_task
def send_scheduled_messages_task():
    call_command('send_scheduled_messages')