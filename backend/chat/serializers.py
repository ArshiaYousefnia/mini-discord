from django.db import transaction
from rest_framework import serializers
from .models import Conversation, ConversationMember, Message, Role, Channel
    
from django.urls import reverse


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
            'conversation', # <-- ADDED THIS
            'sender',
            'is_edited',
            'is_deleted',
            'created_at',
            'updated_at',
        ]

    def validate(self, data):
        if data.get('reply_to'):
            # Since 'conversation' is read-only, it won't be in 'data'. 
            # We get the conversation ID from the URL parameters via the view context.
            view = self.context.get('view')
            if view and 'conversation_id' in view.kwargs:
                url_convo_id = str(view.kwargs['conversation_id'])
                if str(data['reply_to'].conversation_id) != url_convo_id:
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

        

class ConversationListSerializer(serializers.ModelSerializer):
    #type = serializers.CharField(source='type')   # the choice is already a string

    display_name = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.IntegerField()     # will be annotated in the view
    other_user_id = serializers.SerializerMethodField()


    class Meta:
        model = Conversation
        fields = ['id', 'type', 'display_name', 'avatar', 'last_message', 'unread_count', 'other_user_id']

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
    class Meta:
        model = Conversation
        fields = ['id', 'name', 'description', 'avatar']

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Group name is required.")
        return value.strip()

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
        ConversationMember.objects.create(
            conversation=conversation,
            user=user,
            role=role,
        )

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
        ]

    def get_role_name(self, obj):
        if obj.role:
            if obj.role.can_manage_members:
                return "Owner"
            return obj.role.name

        return "Member"

class GroupUpdateSerializer(serializers.ModelSerializer):
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


class ChannelCreateSerializer(serializers.ModelSerializer):
    name = serializers.CharField(required=True, allow_blank=False)
    description = serializers.CharField(required=False, allow_blank=True)
    avatar = serializers.ImageField(required=False)
    is_private = serializers.BooleanField(default=True)
    public_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    class Meta:
        model = Conversation
        fields = ['name', 'description', 'avatar', 'is_private', 'public_id']

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Channel name cannot be empty.")
        return value.strip()

    def validate(self, data):
        is_private = data.get('is_private', True)
        public_id = data.get('public_id', None)

        if not is_private:
            if not public_id or not public_id.strip():
                raise serializers.ValidationError({
                    'public_id': "Public ID is required for public channels."
                })
            # Check uniqueness of public_id
            if Channel.objects.filter(public_id=public_id.strip()).exists():
                raise serializers.ValidationError({
                    'public_id': "This public ID is already taken."
                })
        else:
            # If private, ensure public_id is null (ignore any given value)
            data['public_id'] = None

        return data

    @transaction.atomic
    def create(self, validated_data):
        user = self.context['request'].user
        is_private = validated_data.pop('is_private', True)
        public_id = validated_data.pop('public_id', None)

        # Create the base conversation
        conversation = Conversation.objects.create(
            type=Conversation.Type.CHANNEL,
            name=validated_data.get('name'),
            description=validated_data.get('description', ''),
            avatar=validated_data.get('avatar', None),
            owner=user,
        )

        # Create the channel profile
        Channel.objects.create(
            conversation=conversation,
            is_private=is_private,
            public_id=public_id.strip() if public_id else None,
            # invite_code is auto-generated by default=uuid.uuid4
        )

        # Create "Channel Owner" role
        role = Role.objects.create(
            conversation=conversation,
            name='Channel Owner',
            can_send_messages=True,
            can_send_media=True,
            can_delete_messages=True,
            can_manage_members=True,
            can_manage_roles=True,
        )

        # Add creator as member with that role
        ConversationMember.objects.create(
            conversation=conversation,
            user=user,
            role=role,
        )

        return conversation
    

class ChannelDetailSerializer(serializers.ModelSerializer):
    owner_id = serializers.UUIDField(source="owner.id", read_only=True)
    owner_display_name = serializers.CharField(source="owner.display_name", read_only=True)
    avatar_url = serializers.SerializerMethodField()
    invite_link = serializers.SerializerMethodField() 


    is_private = serializers.BooleanField(source='channel.is_private', read_only=True)
    public_id = serializers.CharField(source='channel.public_id', read_only=True)


    class Meta:
        model = Conversation
        fields = [
            "id",
            "name",
            "description",
            "avatar",
            "avatar_url",
            "owner_id",
            "owner_display_name",
            "created_at",
            "invite_link",
            "is_private", # اضافه شد
            "public_id",  # اضافه شد


        ]


    def get_avatar_url(self, obj):
        return obj.avatar_url

    def get_invite_link(self, obj):
        request = self.context.get('request')
        if not request or not hasattr(obj, 'channel'):
            return None
        
        user = request.user
        
        has_permission = (obj.owner == user)
        
        if not has_permission:
            member = obj.members.filter(user=user).select_related('role').first()
            if member and member.role and member.role.can_manage_members:
                has_permission = True
                
        if has_permission:
            invite_code = obj.channel.invite_code
            path = reverse('channel-join', kwargs={'invite_code': invite_code})
            return request.build_absolute_uri(path)
            
        return None
    
    def get_is_private(self, obj):
        if hasattr(obj, 'channel'):
            return obj.channel.is_private
        return True

    def get_public_id(self, obj):
        if hasattr(obj, 'channel'):
            # Only return the public_id if the channel is NOT private
            if not obj.channel.is_private:
                return obj.channel.public_id
        return None
    
    def get_user_permissions(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None

        user = request.user
        is_owner = (obj.owner == user)

        # 1. By default, the owner has full permissions
        permissions = {
            "is_owner": is_owner,
            "can_send_messages": is_owner,
            "can_send_media": is_owner,
            "can_delete_messages": is_owner,
            "can_manage_members": is_owner,
            "can_manage_roles": is_owner,
            "can_edit_channel_info": is_owner,
            "can_view_invite_link": is_owner,
        }

        # 2. If not the owner, fetch the specific member role
        if not is_owner:
            # Assuming 'members' is the related_name on Conversation for the ConversationMember model
            member = obj.members.filter(user=user).select_related('role').first()
            
            if member and member.role:
                role = member.role
                permissions.update({
                    "can_send_messages": role.can_send_messages,
                    "can_send_media": role.can_send_media,
                    "can_delete_messages": role.can_delete_messages,
                    "can_manage_members": role.can_manage_members,
                    "can_manage_roles": role.can_manage_roles,
                    "can_edit_channel_info": role.can_edit_channel_info,
                    "can_view_invite_link": role.can_view_invite_link,
                })
            elif member:
                # Fallback defaults if a member somehow exists without a specific role assigned
                permissions["can_send_messages"] = True
                permissions["can_send_media"] = True

        return permissions

    
class ChannelUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Conversation
        fields = ['name', 'description', 'avatar']

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Channel name cannot be empty.")
        return value.strip()

    
class ChannelMemberSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    display_name = serializers.CharField(source='user.display_name', read_only=True)
    avatar_url = serializers.CharField(source='user.avatar_url', read_only=True, default=None) 
    role_name = serializers.CharField(source='role.name', read_only=True, default="Member")

    class Meta:
        model = ConversationMember
        fields = ['id', 'user_id', 'username', 'display_name', 'avatar_url', 'role_name']

class ChannelMemberRoleUpdateSerializer(serializers.Serializer):
    role_id = serializers.UUIDField(required=True)

