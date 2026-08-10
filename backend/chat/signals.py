from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Message, Notification, ChannelMessage
from .serializers import NotificationSerializer
from chat.views.views_realtime_utils import broadcast_notification


@receiver(post_save, sender=Message)
@receiver(post_save, sender=ChannelMessage)
def notify_on_reply(sender, instance, created, **kwargs):
    """
    When a message is a reply to another message, notify the original sender.
    """
    if not created:
        return

    # Only trigger if this is a reply and not sent by the original sender
    if instance.reply_to and instance.reply_to.sender != instance.sender:
        # Create notification
        notification = Notification.objects.create(
            recipient=instance.reply_to.sender,
            sender=instance.sender,
            type=Notification.Type.REPLY,
            message_preview=instance.content[:150] if instance.content else '[Attachment]',
            conversation_id=instance.conversation_id,
            message_id=instance.id,
        )

        # Broadcast via WebSocket
        serializer = NotificationSerializer(notification)
        broadcast_notification(notification.recipient.id, serializer.data)
