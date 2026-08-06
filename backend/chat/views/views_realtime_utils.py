import uuid

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from chat.models import Conversation, ConversationMember
from chat.serializers import ChannelMessageSerializer, MessageSerializer


def convert_uuids_to_str(obj):
    if isinstance(obj, dict):
        return {k: convert_uuids_to_str(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_uuids_to_str(item) for item in obj]
    elif isinstance(obj, uuid.UUID):
        return str(obj)
    else:
        return obj


def broadcast_new_message(message):
    channel_layer = get_channel_layer()
    if message.conversation.type == Conversation.Type.CHANNEL:
        data = ChannelMessageSerializer(message).data
    else:
        data = MessageSerializer(message).data

    # Ensure all UUIDs are strings
    data = convert_uuids_to_str(data)

    async_to_sync(channel_layer.group_send)(
        f"conversation_{message.conversation_id}",
        {"type": "new_message", "data": data}
    )


def broadcast_notification(user_id, notification_data):
    """Send notification to a specific user's personal group."""
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"user_{user_id}",
        {
            "type": "notification",
            "data": notification_data,
        }
    )

def broadcast_conversation_update(conversation, event_type, data):
    """
    Send a conversation update event to all members of the conversation.
    The event is sent to each member's personal group.
    """
    channel_layer = get_channel_layer()
    member_ids = ConversationMember.objects.filter(
        conversation=conversation
    ).values_list('user_id', flat=True)

    # For each member, send to their personal group
    for user_id in member_ids:
        async_to_sync(channel_layer.group_send)(
            f"user_{user_id}",
            {
                "type": "conversation_update",
                "data": {
                    "conversation_id": str(conversation.id),
                    "event_type": event_type,
                    **data
                }
            }
        )