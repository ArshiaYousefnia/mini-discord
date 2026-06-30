from rest_framework import serializers
from django.core.validators import MaxLengthValidator
from .models import Conversation, ConversationMember, Message


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