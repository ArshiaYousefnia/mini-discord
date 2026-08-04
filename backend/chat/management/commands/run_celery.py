import subprocess
import sys
import os
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Run Celery worker and beat'

    def handle(self, *args, **options):
        project_name = os.environ.get('DJANGO_SETTINGS_MODULE', 'your_project.settings')
        project_name = project_name.split('.')[0]  # Get project name

        # Run worker
        worker_cmd = [
            'celery', '-A', project_name, 'worker',
            '--loglevel=info', '--detach'
        ]

        # Run beat
        beat_cmd = [
            'celery', '-A', project_name, 'beat',
            '--loglevel=info', '--detach',
            '--scheduler', 'django_celery_beat.schedulers:DatabaseScheduler'
        ]

        try:
            self.stdout.write("Starting Celery worker...")
            subprocess.Popen(worker_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.stdout.write(self.style.SUCCESS("Celery worker started"))

            self.stdout.write("Starting Celery beat...")
            subprocess.Popen(beat_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.stdout.write(self.style.SUCCESS("Celery beat started"))

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Failed to start Celery: {e}"))