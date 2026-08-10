import os
from rest_framework import serializers
from .models import Conversation, ConversationMember, Message, Role, Attachment, Notification

import mimetypes


ALLOWED_FILE_EXTENSIONS = {
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp',  # images
    'mp4', 'mov', 'avi', 'mkv', 'webm',  # videos
    'mp3', 'ogg', 'wav', 'flac', 'aac',  # audio
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',  # documents
    'txt', 'csv', 'zip', 'rar', '7z',  # misc
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

ALLOWED_AVATAR_CONTENT_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}
ALLOWED_AVATAR_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2MB

def validate_avatar_file(value):
    if value:
        if value.size > MAX_AVATAR_SIZE:
            raise serializers.ValidationError("Avatar must be smaller than 2MB.")
        
        ext = os.path.splitext(value.name)[1].lower().lstrip('.')
        
        if ext not in ALLOWED_AVATAR_EXTENSIONS:
            raise serializers.ValidationError("Only valid image formats (JPG, PNG, GIF, WEBP) are allowed.")
            
    return value


class GroupDetailSerializer(serializers.ModelSerializer):
    owner_id = serializers.UUIDField(source='owner.id', read_only=True)
    owner_display_name = serializers.CharField(source='owner.display_name', read_only=True)
    avatar_url = serializers.SerializerMethodField()
    invite_token = serializers.UUIDField(read_only=True)
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            'id', 'type', 'name', 'description',
            'avatar', 'avatar_url',
            'owner_id', 'owner_display_name',
            'created_at', 'invite_token', 'member_count',
        ]
        read_only_fields = ['id', 'type', 'created_at', 'invite_token']

    def get_avatar_url(self, obj):
        return obj.avatar_url

    def get_member_count(self, obj):
        return obj.members.count()



class MinimalMessageSerializer(serializers.ModelSerializer):
    sender_display_name = serializers.CharField(source='sender.display_name', read_only=True)
    attachments_count = serializers.SerializerMethodField()
    preview = serializers.SerializerMethodField()
    preview_icon = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            'id', 'content', 'sender_display_name', 'created_at',
            'attachments_count', 'preview', 'preview_icon'
        ]

    def get_attachments_count(self, obj):
        return obj.attachments.count()

    def _get_attachment_type(self, obj):
        """Determine the type of the first attachment."""
        attachments = obj.attachments.all()
        if not attachments:
            return None

        for att in attachments:
            if att.file:
                mime_type, _ = mimetypes.guess_type(att.original_filename)
                if mime_type:
                    if mime_type.startswith('video/'):
                        return 'video'
                    if mime_type.startswith('image/'):
                        return 'photo'
                    if mime_type.startswith('audio/'):
                        return 'audio'
        return 'file'

    def get_preview(self, obj):
        content = obj.content
        if content and content.strip():
            return content

        att_type = self._get_attachment_type(obj)
        if not att_type:
            return "No content"

        labels = {
            'video': 'Video',
            'photo': 'Photo',
            'audio': 'Audio',
            'file': 'File'
        }
        return labels.get(att_type, 'File')

    def get_preview_icon(self, obj):
        """Return an icon name for the client to display."""
        content = obj.content
        if content and content.strip():
            return 'text'

        att_type = self._get_attachment_type(obj)
        return att_type or 'file'  # default to 'file' if unknown


class AttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = ['id', 'file_url', 'original_filename', 'size', 'created_at']
        read_only_fields = ['id', 'file_url', 'original_filename', 'size', 'created_at']

    def get_file_url(self, obj):
        if obj.file and hasattr(obj.file, 'url'):
            return obj.file.url
        return None


class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    sender_display_name = serializers.CharField(source='sender.display_name', read_only=True)
    sender_avatar = serializers.SerializerMethodField()
    attachments = AttachmentSerializer(many=True, read_only=True)
    uploaded_files = serializers.ListField(
        child=serializers.FileField(max_length=None, allow_empty_file=False, use_url=False),
        write_only=True,
        required=False,
    )

    class Meta:
        model = Message
        fields = [
            'id', 'conversation', 'sender', 'sender_username', 'sender_display_name','sender_avatar',
            'content', 'attachments', 'uploaded_files',
            'reply_to', 'is_edited', 'is_deleted', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'conversation', 'sender',
            'is_edited', 'is_deleted', 'created_at', 'updated_at',
        ]
    def get_sender_avatar(self, obj):
        if obj.sender and hasattr(obj.sender, 'avatar_url'):
            return obj.sender.avatar_url
        return None

    def create(self, validated_data):
        # Remove the write-only field before passing to model
        uploaded_files = validated_data.pop('uploaded_files', [])
        instance = super().create(validated_data)
        # Attachments are handled by the view, not here.
        return instance

    # Keep validate_uploaded_files, validate, and validate_content exactly as before

    def validate_uploaded_files(self, files):
        if files is None:
            return files
        for file in files:
            ext = os.path.splitext(file.name)[1].lower().lstrip('.')
            if ext not in ALLOWED_FILE_EXTENSIONS:
                raise serializers.ValidationError(
                    f"File type .{ext} is not supported. Allowed types: {', '.join(sorted(ALLOWED_FILE_EXTENSIONS))}"
                )
            if file.size > MAX_FILE_SIZE:
                raise serializers.ValidationError("File size must be under 10 MB.")
        return files

    def validate(self, data):
        # Existing reply_to check
        if data.get('reply_to'):
            view = self.context.get('view')
            if view and 'conversation_id' in view.kwargs:
                url_convo_id = str(view.kwargs['conversation_id'])
                if str(data['reply_to'].conversation_id) != url_convo_id:
                    raise serializers.ValidationError("Reply message does not belong to this conversation.")
        # Content or at least one attachment required
        content = data.get('content')
        uploaded_files = data.get('uploaded_files')
        if not content and not uploaded_files:
            raise serializers.ValidationError("Either message content or at least one file is required.")
        return data

    def validate_content(self, value):
        # If content is provided, it must not be empty after strip
        if value and not value.strip():
            raise serializers.ValidationError("Message cannot be empty.")
        if value and len(value) > 2000:
            raise serializers.ValidationError("Message must be 2000 characters or fewer.")
        return value


class ConversationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Conversation
        fields = ['id', 'type', 'name', 'created_at']


class ConversationMemberSerializer(serializers.ModelSerializer):
    user = serializers.StringRelatedField()  # or use a user serializer

    class Meta:
        model = ConversationMember


class ConversationListSerializer(serializers.ModelSerializer):
    # type = serializers.CharField(source='type')   # the choice is already a string

    display_name = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.IntegerField()  # will be annotated in the view
    other_user_id = serializers.SerializerMethodField()
    other_user_is_online = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ['id', 'type', 'display_name', 'avatar', 'last_message', 'unread_count', 'other_user_id',
                  'other_user_is_online']

    def get_other_user_is_online(self, obj):
        user = self.context['request'].user
        if obj.type == Conversation.Type.DM:
            other = obj.get_other_user(user)
            return other.is_online if other else False
        return False

    def get_other_user_id(self, obj):
        user = self.context['request'].user
        other = None
        if obj.type == Conversation.Type.DM:
            other = obj.get_other_user(user)
        return other.id if other else None

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



class GroupCreateSerializer(serializers.ModelSerializer):
    avatar = serializers.FileField(required=False, allow_null=True)
    class Meta:
        model = Conversation
        fields = ['id', 'name', 'description', 'avatar']

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Group name is required.")
        return value.strip()

    def validate_avatar(self, value):
        return validate_avatar_file(value)

    def create(self, validated_data):
        user = self.context['request'].user
        # Set conversation type and owner
        validated_data['type'] = Conversation.Type.GROUP
        validated_data['owner'] = user

        conversation = super().create(validated_data)

        # Create default Group Owner role
        role = Role.objects.create(
            conversation=conversation,
            name='Group Owner',
            can_send_messages=True,
            can_send_media=True,
            can_delete_messages=True,
            can_manage_members=True,
            can_manage_roles=True,
        )

        # Add the creator as a member with that role
        member = ConversationMember.objects.create(conversation=conversation, user=user)
        member.roles.add(role)

        return conversation


class GroupMemberSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source='user.id', read_only=True)
    display_name = serializers.CharField(source='user.display_name', read_only=True)
    avatar_url = serializers.CharField(source='user.avatar_url', read_only=True)
    is_online = serializers.BooleanField(source='user.is_online', read_only=True)
    role_name = serializers.SerializerMethodField()

    class Meta:
        model = ConversationMember
        fields = [
            'user_id',
            'display_name',
            'avatar_url',
            'is_online',
            'role_name',
            'roles',
        ]

    roles = serializers.SerializerMethodField()  # تغییر نام فیلد به roles

    def get_roles(self, obj):
        role_names = [role.name for role in obj.roles.all()]
        return role_names if role_names else ["Member"]

    def get_role_name(self, obj):
        first_role = obj.roles.first()
        return first_role.name if first_role else "Member"


class GroupUpdateSerializer(serializers.ModelSerializer):
    avatar = serializers.FileField(required=False, allow_null=True)
    class Meta:
        model = Conversation
        fields = (
            "name",
            "description",
            "avatar",
        )

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError(
                "Group name is required."
            )
        return value

    def validate_avatar(self, value):
        return validate_avatar_file(value)


class NotificationSerializer(serializers.ModelSerializer):
    sender_display_name = serializers.CharField(source='sender.display_name', read_only=True)
    sender_avatar = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            'id', 'type', 'message_preview', 'created_at', 'is_read',
            'sender_display_name', 'sender_avatar', 'conversation_id', 'message_id'
        ]
        read_only_fields = fields

    def get_sender_avatar(self, obj):
        return obj.sender.avatar_url if obj.sender else None
