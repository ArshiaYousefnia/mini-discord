from rest_framework import serializers
from .models import Conversation, ConversationMember, Message

class MinimalMessageSerializer(serializers.ModelSerializer):
    sender_display_name = serializers.CharField(source='sender.display_name', read_only=True)

    class Meta:
        model = Message
        fields = ['id', 'content', 'sender_display_name', 'created_at']

class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    sender_display_name = serializers.CharField(source='sender.display_name', read_only=True)

    class Meta:
        model = Message
        fields = [
            'id',
            'conversation',
            'sender',
            'sender_username',
            'sender_display_name',
            'content',
            'reply_to',
            'is_edited',
            'is_deleted',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'sender',
            'is_edited',
            'is_deleted',
            'created_at',
            'updated_at',
        ]

    def validate(self, data):
        if data.get('reply_to'):
            if data['reply_to'].conversation_id != data['conversation'].id:
                raise serializers.ValidationError("Reply message does not belong to this conversation.")
        return data

    def validate_content(self, value):
        # Strip whitespace and check it's not empty
        if not value or not value.strip():
            raise serializers.ValidationError("Message cannot be empty.")
        # Enforce character limit (2000)
        if len(value) > 2000:
            raise serializers.ValidationError("Message must be 2000 characters or fewer.")
        return value


# For listing conversations, we may want a simple serializer
class ConversationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Conversation
        fields = ['id', 'type', 'name', 'created_at']


class ConversationMemberSerializer(serializers.ModelSerializer):
    user = serializers.StringRelatedField()  # or use a user serializer
    class Meta:
        model = ConversationMember
        fields = ['user', 'joined_at']

class ConversationListSerializer(serializers.ModelSerializer):
    type = serializers.CharField(source='type')   # the choice is already a string
    display_name = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.IntegerField()     # will be annotated in the view

    class Meta:
        model = Conversation
        fields = ['id', 'type', 'display_name', 'avatar', 'last_message', 'unread_count']

    def get_display_name(self, obj):
        user = self.context['request'].user
        if obj.type == Conversation.Type.DM:
            other = obj.get_other_user(user)
            return other.display_name if other else "Unknown"
        return obj.name or "Unnamed"

    def get_avatar(self, obj):
        user = self.context['request'].user
        if obj.type == Conversation.Type.DM:
            other = obj.get_other_user(user)
            return other.avatar_url if other else None

        return obj.avatar_url

    def get_last_message(self, obj):
        # The view will prefetch the latest message into '_last_message_prefetched'
        if hasattr(obj, '_last_message_prefetched') and obj._last_message_prefetched:
            msg = obj._last_message_prefetched[0]
            return MinimalMessageSerializer(msg).data
        return None

class ConversationMarkReadSerializer(serializers.Serializer):
    last_read_message_id = serializers.UUIDField(required=True)


