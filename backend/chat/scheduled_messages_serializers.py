from rest_framework import serializers

from chat.models import ScheduledAttachment, ScheduledMessage, Conversation


class ScheduledAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = ScheduledAttachment
        fields = ['id', 'file_url', 'original_filename', 'size', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_file_url(self, obj):
        if obj.file:
            return obj.file.url
        return None


class ScheduledMessageSerializer(serializers.ModelSerializer):
    attachments = ScheduledAttachmentSerializer(many=True, read_only=True)
    uploaded_files = serializers.ListField(
        child=serializers.FileField(
            max_length=None,
            allow_empty_file=False,
            use_url=False
        ),
        write_only=True,
        required=False,
    )
    conversation_name = serializers.CharField(source='conversation.name', read_only=True)
    topic_id = serializers.UUIDField(write_only=True, required=False)
    topic = serializers.SerializerMethodField()
    failed = serializers.BooleanField(read_only=True)
    failure_reason = serializers.CharField(read_only=True)

    class Meta:
        model = ScheduledMessage
        fields = [
            'id', 'conversation', 'conversation_name', 'content', 'reply_to',
            'scheduled_at', 'sent', 'failed', 'failure_reason',
            'created_at', 'updated_at',
            'attachments', 'uploaded_files', 'topic_id', 'topic'
        ]
        read_only_fields = [
            'id', 'conversation', 'sender', 'sent', 'failed',
            'failure_reason', 'created_at', 'updated_at', 'conversation_name', 'topic'
        ]

    def get_topic(self, obj):
        if obj.topic:
            return {
                'id': str(obj.topic.id),
                'name': obj.topic.name,
                'creator': obj.topic.creator.display_name
            }
        return None

    def validate_scheduled_at(self, value):
        from django.utils import timezone
        if value <= timezone.now():
            raise serializers.ValidationError("Scheduled time must be in the future.")
        return value

    def validate_content(self, value):
        if value and len(value) > 2000:
            raise serializers.ValidationError("Message must be 2000 characters or fewer.")
        return value

    def validate(self, data):
        if not data.get('content') and not data.get('uploaded_files'):
            raise serializers.ValidationError("Either content or at least one file is required.")
        if data.get('content') and not data.get('content').strip():
            raise serializers.ValidationError("Message cannot be empty.")

        # Get conversation from context
        conversation = self.context.get('conversation')
        topic_id = data.get('topic_id')

        if conversation:
            if conversation.type == Conversation.Type.CHANNEL:
                if topic_id:
                    from .models import Topic
                    try:
                        topic = Topic.objects.get(id=topic_id, conversation=conversation)
                        data['topic'] = topic
                    except Topic.DoesNotExist:
                        raise serializers.ValidationError({
                            'topic_id': "Topic not found in this channel."
                        })
            else:
                # Groups and DMs should not have topic_id
                if topic_id:
                    raise serializers.ValidationError({
                        'topic_id': "Topics are only available in channels."
                    })
        else:
            # If no conversation in context, we can't validate the topic
            # This is a fallback - it shouldn't happen in normal usage
            if topic_id:
                # Still validate that it's a valid UUID, but can't check conversation type
                pass

        return data

    def create(self, validated_data):
        uploaded_files = validated_data.pop('uploaded_files', [])
        instance = super().create(validated_data)

        for file in uploaded_files:
            ScheduledAttachment.objects.create(
                scheduled_message=instance,
                file=file,
                original_filename=file.name,
                size=file.size,
            )

        return instance
