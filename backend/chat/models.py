import uuid
from django.conf import settings
from django.core.files.storage import default_storage
from django.db import models

from users.models import avatar_upload_path, DEFAULT_AVATAR_PATH


class Conversation(models.Model):
    class Type(models.TextChoices):
        DM = 'DM', 'Direct Message'
        GROUP = 'GROUP', 'Group'
        CHANNEL = 'CHANNEL', 'Channel'
        SAVED = 'SAVED', 'Saved Messages'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    type = models.CharField(max_length=10, choices=Type.choices)
    name = models.CharField(max_length=200, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    
    # Newly added invite_token for joining groups via URL
    invite_token = models.UUIDField(
        default=uuid.uuid4, 
        unique=False, 
        editable=False, 
        db_index=True
    )

    avatar = models.FileField(
        upload_to=avatar_upload_path,
        blank=True,
        null=True,
        default=None
    )

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='owned_conversations',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def avatar_url(self):
        if self.avatar and self.avatar.name:
            return default_storage.url(self.avatar.name)
        return default_storage.url(DEFAULT_AVATAR_PATH)

    def get_other_user(self, user):
        """Return the other user in a DM conversation."""
        if self.type != self.Type.DM:
            return None
        return self.members.exclude(user=user).first().user if self.members.count() == 2 else None

    def __str__(self):
        if self.type == self.Type.DM:
            return f"DM between users (id: {self.id})"
        return self.name or f"{self.type} {self.id}"


class Role(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='roles',
    )
    name = models.CharField(max_length=100)
    can_send_messages = models.BooleanField(default=True)
    can_send_media = models.BooleanField(default=True)
    can_delete_messages = models.BooleanField(default=False)
    can_manage_members = models.BooleanField(default=False)
    can_manage_roles = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.name} ({self.conversation_id})"


class ConversationMember(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='members',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='conversation_memberships',
    )
    # role is nullable and not used for DM
    role = models.ForeignKey(
        'Role',  # we'll skip this model for now; can be added later
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    last_read_message = models.ForeignKey(
        'Message',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',  # no reverse relation needed
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('conversation', 'user')

    def __str__(self):
        return f"{self.user.username} in {self.conversation}"


class Message(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='messages',
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='sent_messages',
    )
    content = models.TextField(null=True, blank=True)
    reply_to = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='replies',
    )
    is_edited = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Message {self.id} in {self.conversation_id}"