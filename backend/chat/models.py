import uuid
import os
from datetime import datetime
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
    can_view_invite_link = models.BooleanField(default=False)
    can_edit_channel_info = models.BooleanField(default=False)
    can_delete_channel = models.BooleanField(default=False)
    can_create_topic = models.BooleanField(default=False)
    can_manage_others_topics = models.BooleanField(default=False)

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
    roles = models.ManyToManyField(
        'Role',
        blank=True,
        related_name='members',
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

class Channel(models.Model):
    conversation = models.OneToOneField(
        Conversation,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name='channel',
    )
    is_private = models.BooleanField(default=True)
    public_id = models.CharField(
        max_length=100,
        unique=True,
        null=True,
        blank=True,
        help_text="Unique public identifier, required only for public channels.",
    )
    invite_code = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
        help_text="Permanent invite code (never changes).",
    )

    @property
    def invite_link(self):
        # The view will build the absolute URL; we just expose the code.
        return self.invite_code


class Topic(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='topics',
        limit_choices_to={'type': Conversation.Type.CHANNEL},
    )
    name = models.CharField(max_length=200)
    creator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='created_topics',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('conversation', 'name')

    def __str__(self):
        return f"{self.name} in {self.conversation_id}"


class ChannelMessage(Message):
    topic = models.ForeignKey(
        Topic,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='messages',
    )

def attachment_upload_path(instance, filename):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    ext = os.path.splitext(filename)[1]
    new_filename = f"{uuid.uuid4()}_{timestamp}{ext}"
    return f"attachments/{new_filename}"


class Attachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name='attachments',
    )
    file = models.FileField(upload_to=attachment_upload_path)
    original_filename = models.CharField(max_length=255)
    size = models.PositiveIntegerField()  # in bytes
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Attachment {self.id} for message {self.message_id}"

class Notification(models.Model):
    class Type(models.TextChoices):
        DM = 'DM', 'Direct Message'
        REPLY = 'REPLY', 'Reply'
        GROUP_ADDED = 'GROUP_ADDED', 'Added to group'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='sent_notifications'
    )
    type = models.CharField(max_length=20, choices=Type.choices)
    message_preview = models.CharField(max_length=150)
    conversation_id = models.UUIDField(null=True, blank=True)
    message_id = models.UUIDField(null=True, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', 'is_read']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"{self.type} for {self.recipient.username} from {self.sender.username if self.sender else 'system'}"


class ScheduledMessage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='scheduled_messages'
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='scheduled_messages'
    )
    content = models.TextField(blank=True, null=True)
    reply_to = models.ForeignKey(
        Message,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    scheduled_at = models.DateTimeField()
    sent = models.BooleanField(default=False)
    failed = models.BooleanField(default=False)  # New field
    failure_reason = models.TextField(blank=True, null=True)  # Optional
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Topic is only applicable for channels
    topic = models.ForeignKey(
        'Topic',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='scheduled_messages'
    )

    class Meta:
        ordering = ['scheduled_at']
        indexes = [
            models.Index(fields=['scheduled_at', 'sent', 'failed']),
            models.Index(fields=['sender', 'sent']),
        ]

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        status = "sent" if self.sent else "failed" if self.failed else "pending"
        return f"Scheduled for {self.scheduled_at} by {self.sender.username} ({status})"

class ScheduledAttachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    scheduled_message = models.ForeignKey(
        ScheduledMessage,
        on_delete=models.CASCADE,
        related_name='attachments'
    )
    file = models.FileField(upload_to=attachment_upload_path)
    original_filename = models.CharField(max_length=255)
    size = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Attachment for scheduled message {self.scheduled_message_id}"