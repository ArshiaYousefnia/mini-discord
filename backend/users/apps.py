import sys

from django.apps import AppConfig
from django.core.files.storage import default_storage
from storages.backends.s3boto3 import S3Boto3Storage

class UsersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'users'

    def ready(self):
        if 'test' not in sys.argv and not isinstance(default_storage._wrapped, S3Boto3Storage):
            default_storage._wrapped = S3Boto3Storage()