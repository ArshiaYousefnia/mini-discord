import uuid
from django.db import models
from django.conf import settings


class Message(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="messages"
    )

    text = models.TextField(max_length=2000)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    is_edited = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        if self.pk:
            self.is_edited = True
        super().save(*args, **kwargs)