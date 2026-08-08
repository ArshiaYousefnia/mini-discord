import uuid

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models import Q

from chat.models import Conversation, ConversationMember, Message
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


def broadcast_message_updated(message):
    """Send the full updated message to the active chat window."""
    channel_layer = get_channel_layer()

    # Serialize the message exactly like we do for new messages
    if message.conversation.type == Conversation.Type.CHANNEL:
        data = ChannelMessageSerializer(message).data
    else:
        data = MessageSerializer(message).data

    # Ensure all UUIDs are strings
    data = convert_uuids_to_str(data)

    async_to_sync(channel_layer.group_send)(
        f"conversation_{message.conversation_id}",
        {
            "type": "message_updated",  # Ensure your Consumer has a method named `message_updated`
            "data": data
        }
    )


def broadcast_message_deleted(message_id, conversation_id):
    """Send the ID of the deleted message to the active chat window."""
    channel_layer = get_channel_layer()

    async_to_sync(channel_layer.group_send)(
        f"conversation_{conversation_id}",
        {
            "type": "message_deleted",  # Ensure your Consumer has a method named `message_deleted`
            "data": {"id": str(message_id)}
        }
    )


def broadcast_unread_update_for_conversation(conversation):
    channel_layer = get_channel_layer()
    members = ConversationMember.objects.filter(conversation=conversation).select_related('user')
    for member in members:
        last_read_created = member.last_read_message.created_at if member.last_read_message else None
        q_filter = Q(conversation=conversation, is_deleted=False)
        if last_read_created is not None:
            q_filter &= Q(created_at__gt=last_read_created)

        unread_count = Message.objects.filter(q_filter).count()
        async_to_sync(channel_layer.group_send)(
            f"user_{member.user.id}",
            {
                "type": "conversation_update",
                "data": {
                    "conversation_id": str(conversation.id),
                    "event_type": "unread_updated",
                    "unread_count": unread_count
                }
            }
        )

def broadcast_user_profile_update(user):
    """
    Broadcast profile updates in two places:

    1. To global user sockets of:
       - the updated user
       - every user who shares a DM with the updated user

       This updates sidebars even when the DM is not currently open.

    2. To all conversation sockets the user is a member of.

       This updates currently opened chat views, group member lists,
       message sender info, etc.
    """
    channel_layer = get_channel_layer()

    data = {
        "user_id": str(user.id),
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
    }

    # --------------------------------------------------
    # 1. Find all conversations the user is a member of
    # --------------------------------------------------
    member_conversation_ids = list(
        ConversationMember.objects.filter(user=user)
        .values_list("conversation_id", flat=True)
    )

    # --------------------------------------------------
    # 2. Find only DM conversations involving this user
    # --------------------------------------------------
    dm_conversation_ids = list(
        Conversation.objects.filter(
            id__in=member_conversation_ids,
            type=Conversation.Type.DM,
        ).values_list("id", flat=True)
    )

    # --------------------------------------------------
    # 3. Find all users who share those DMs with this user
    # --------------------------------------------------
    dm_peer_user_ids = set(
        ConversationMember.objects.filter(
            conversation_id__in=dm_conversation_ids
        )
        .exclude(user_id=user.id)
        .values_list("user_id", flat=True)
    )

    # Include the updated user too, for their own UI
    global_socket_user_ids = {user.id, *dm_peer_user_ids}

    # --------------------------------------------------
    # 4. Send to global /ws/user/ sockets
    # --------------------------------------------------
    for target_user_id in global_socket_user_ids:
        async_to_sync(channel_layer.group_send)(
            f"user_{target_user_id}",
            {
                "type": "user_updated",
                "data": data,
            },
        )

    # --------------------------------------------------
    # 5. Send to all active conversation sockets as before
    # --------------------------------------------------
    for conv_id in member_conversation_ids:
        async_to_sync(channel_layer.group_send)(
            f"conversation_{conv_id}",
            {
                "type": "user_updated",
                "data": data,
            },
        )


def broadcast_conversation_metadata_update(conversation):
    """
    Send conversation metadata update to the conversation group.
    """
    channel_layer = get_channel_layer()
    data = {
        'conversation_id': str(conversation.id),
        'name': conversation.name,
        'description': conversation.description,
        'avatar_url': conversation.avatar_url,
    }
    async_to_sync(channel_layer.group_send)(
        f"conversation_{conversation.id}",
        {
            "type": "conversation_metadata_updated",
            "data": data
        }
    )
