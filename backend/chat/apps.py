from django.apps import AppConfig
import os
import subprocess
import sys


class ChatConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'chat'

    def ready(self):
        import chat.signals

        # Only run when using runserver (development)
        if 'runserver' in sys.argv:
            try:
                project_name = os.environ.get('DJANGO_SETTINGS_MODULE', 'your_project.settings')
                project_name = project_name.split('.')[0]

                # Check if Celery is already running
                import psutil
                for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                    try:
                        if 'celery' in ' '.join(proc.info['cmdline'] or []):
                            # Celery is already running
                            return
                    except:
                        pass

                # Start Celery
                worker_cmd = ['celery', '-A', project_name, 'worker', '--loglevel=info', '--detach']
                beat_cmd = ['celery', '-A', project_name, 'beat', '--loglevel=info', '--detach',
                            '--scheduler', 'django_celery_beat.schedulers:DatabaseScheduler']

                subprocess.Popen(worker_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                subprocess.Popen(beat_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                print("Celery started from Django startup")
            except Exception as e:
                print(f"Failed to start Celery: {e}")
