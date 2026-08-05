import mimetypes
from django.http import FileResponse
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets, mixins
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.generics import ListAPIView, UpdateAPIView
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Notification
from .serializers import NotificationSerializer

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .serializers import MessageSerializer, ChannelMessageSerializer, NotificationSerializer

from rest_framework.generics import CreateAPIView, ListAPIView, DestroyAPIView
from rest_framework.exceptions import PermissionDenied
from .models import ScheduledMessage, ScheduledAttachment
from .serializers import ScheduledMessageSerializer
from django.shortcuts import get_object_or_404
from django.utils import timezone

def broadcast_new_message(message):
    channel_layer = get_channel_layer()
    # Choose the correct serializer based on conversation type
    if message.conversation.type == Conversation.Type.CHANNEL:
        data = ChannelMessageSerializer(message).data
    else:
        data = MessageSerializer(message).data
    async_to_sync(channel_layer.group_send)(
        f"conversation_{message.conversation_id}",
        {
            "type": "new_message",   # matches the method in ChatConsumer
            "data": data,
        }
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

from .serializers import MessageSerializer, ConversationSerializer, ConversationMarkReadSerializer, \
    MinimalMessageSerializer, ChannelCreateSerializer, RoleSerializer, TopicSerializer, TopicUpdateSerializer, \
    TopicCreateSerializer, ChannelMessageSerializer

from django.contrib.auth import get_user_model

from django.db.models import OuterRef, Subquery, Count, Q, Value, Prefetch
from django.db.models.functions import Coalesce
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from .models import Conversation, ConversationMember, Message, Role, Channel, Topic, ChannelMessage, Attachment, \
    Notification

from .serializers import ChannelMemberRoleUpdateSerializer,ChannelMemberSerializer,ChannelUpdateSerializer,ChannelDetailSerializer,GroupUpdateSerializer,GroupMemberSerializer,ConversationListSerializer, GroupCreateSerializer, GroupDetailSerializer, ChannelDetailSerializer


User = get_user_model()



class SendDirectMessageView(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = MessageSerializer

    @transaction.atomic
    def create(self, request):
        """
        Send a direct message to another user.
        """
        recipient_id = request.data.get('recipient_id')
        content = request.data.get('content', '')  # allow empty
        reply_to = request.data.get('reply_to')
        uploaded_files = request.FILES.getlist('uploaded_files') if request.FILES else []

        if not recipient_id:
            return Response(
                {"recipient_id": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate recipient exists
        recipient = get_object_or_404(User, id=recipient_id)
        if recipient == request.user:
            return Response(
                {"error": "You cannot send a message to yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Find existing DM conversation between the two users
        conversation = Conversation.objects.filter(
            type=Conversation.Type.DM,
            members__user=request.user
        ).filter(
            members__user=recipient
        ).distinct().first()

        # If not found, create a new DM conversation and add both members
        if not conversation:
            conversation = Conversation.objects.create(type=Conversation.Type.DM)
            ConversationMember.objects.create(conversation=conversation, user=request.user)
            ConversationMember.objects.create(conversation=conversation, user=recipient)

        # Build data dictionary for serializer
        data = {
            'conversation': str(conversation.id),
            'content': content,
            'reply_to': reply_to,
        }
        if uploaded_files:
            data['uploaded_files'] = uploaded_files

        # Validate using the serializer (it will require content or file)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)

        # Save the message
        message = serializer.save(sender=request.user, conversation=conversation)

        # Create attachment records
        for file in serializer.validated_data.get('uploaded_files', []):
            Attachment.objects.create(
                message=message,
                file=file,
                original_filename=file.name,
                size=file.size,
            )

        # Update sender's last_read_message
        member = ConversationMember.objects.get(conversation=conversation, user=request.user)
        member.last_read_message = message
        member.save()

        broadcast_new_message(message)

        notification = Notification.objects.create(
            recipient=recipient,
            sender=request.user,
            type=Notification.Type.DM,
            message_preview=content[:150] if content else '[Attachment]',
            conversation_id=conversation.id,
            message_id=message.id,
        )

        # Broadcast via WebSocket
        notif_serializer = NotificationSerializer(notification)
        broadcast_notification(recipient.id, notif_serializer.data)

        return Response(serializer.data, status=status.HTTP_201_CREATED)

class ConversationViewSet(mixins.ListModelMixin,
                          mixins.RetrieveModelMixin,
                          viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ConversationSerializer

    def get_queryset(self):
        # Return all conversations the user is a member of
        return Conversation.objects.filter(
            members__user=self.request.user
        ).distinct()

    @action(detail=True, methods=['post'], url_path='leave')
    def leave(self, request, pk=None):
        conversation = self.get_object()  # ensures user is a member

        if conversation.type not in [Conversation.Type.GROUP, Conversation.Type.CHANNEL]:
            return Response(
                {"detail": "You can only leave group or channel conversations."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if conversation.owner == request.user:
            return Response(
                {"detail": "The owner cannot leave. Transfer ownership first or delete the conversation."},
                status=status.HTTP_403_FORBIDDEN
            )

        ConversationMember.objects.filter(
            conversation=conversation,
            user=request.user
        ).delete()

        return Response(status=status.HTTP_204_NO_CONTENT)
    @action(detail=True, methods=['post'], url_path='remove-member')
    def remove_member(self, request, pk=None):
        conversation = self.get_object()  # ensures user is a member of the conversation

        # Only allow for groups
        if conversation.type != Conversation.Type.GROUP:
            return Response(
                {"detail": "Member removal is only available for groups."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check that the requester is the owner
        if conversation.owner != request.user:
            return Response(
                {"detail": "Only the group owner can remove members."},
                status=status.HTTP_403_FORBIDDEN
            )

        target_user_id = request.data.get('user_id')
        if not target_user_id:
            return Response(
                {"detail": "user_id is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate that the target user is actually a member of this group
        membership = ConversationMember.objects.filter(
            conversation=conversation,
            user_id=target_user_id
        ).first()

        if not membership:
            return Response(
                {"detail": "This user is not a member of the group."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Prevent owner from removing themselves (they must use leave or delete group)
        if str(target_user_id) == str(request.user.id):
            return Response(
                {"detail": "You cannot remove yourself. Use the leave action instead."},
                status=status.HTTP_400_BAD_REQUEST
            )

        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MessageViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet
):
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        # For create/update, use the basic serializer (input validation)
        if self.action in ('create', 'update', 'partial_update'):
            return MessageSerializer
        # For list/retrieve, decide based on conversation type
        conversation_id = self.kwargs.get('conversation_pk')
        if conversation_id:
            try:
                conv = Conversation.objects.get(id=conversation_id)
                if conv.type == Conversation.Type.CHANNEL:
                    return ChannelMessageSerializer
            except Conversation.DoesNotExist:
                pass
        return MessageSerializer

    def get_queryset(self):
        conversation_id = self.kwargs.get("conversation_pk")
        try:
            conv = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Message.objects.none()

        if conv.type == Conversation.Type.CHANNEL:
            return ChannelMessage.objects.filter(
                conversation_id=conversation_id,
                conversation__members__user=self.request.user,
                is_deleted=False
            ).select_related('topic').order_by("created_at")
        else:
            return Message.objects.filter(
                conversation_id=conversation_id,
                conversation__members__user=self.request.user,
                is_deleted=False
            ).order_by("created_at")

    def perform_create(self, serializer):
        conversation_id = self.kwargs.get("conversation_pk")
        conversation = get_object_or_404(Conversation, id=conversation_id)
        # Membership check (keep existing logic)
        if not ConversationMember.objects.filter(
                conversation=conversation, user=self.request.user
        ).exists():
            raise PermissionDenied("You are not a member of this conversation.")

        # Channel permission check (unchanged)
        topic = None
        if conversation.type == Conversation.Type.CHANNEL:
            member = ConversationMember.objects.get(
                conversation=conversation,
                user=self.request.user
            )
            if not member.roles.filter(can_send_messages=True).exists():
                raise PermissionDenied("You do not have permission to send messages in this channel.")
            topic_id = self.request.data.get('topic_id')
            if topic_id:
                topic = get_object_or_404(Topic, id=topic_id, conversation=conversation)

        # Create the message (choose ChannelMessage if channel)
        if conversation.type == Conversation.Type.CHANNEL:
            message = ChannelMessage.objects.create(
                conversation=conversation,
                sender=self.request.user,
                content=serializer.validated_data.get('content'),
                reply_to=serializer.validated_data.get('reply_to'),
                topic=topic,
            )
        else:
            message = serializer.save(
                sender=self.request.user, conversation=conversation
            )

        # Handle uploaded files (create Attachments)
        uploaded_files = serializer.validated_data.get('uploaded_files', [])
        for file in uploaded_files:
            Attachment.objects.create(
                message=message,
                file=file,
                original_filename=file.name,
                size=file.size,
            )

        # Update last_read_message
        member = ConversationMember.objects.get(
            conversation=conversation,
            user=self.request.user
        )
        member.last_read_message = message
        member.save(update_fields=['last_read_message'])

        broadcast_new_message(message)

        return message

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = self.perform_create(serializer)

        # Explicitly choose output serializer based on conversation type
        conversation_id = self.kwargs.get('conversation_pk')
        try:
            conv = Conversation.objects.get(id=conversation_id)
            if conv.type == Conversation.Type.CHANNEL:
                out_serializer = ChannelMessageSerializer(message, context=self.get_serializer_context())
            else:
                out_serializer = MessageSerializer(message, context=self.get_serializer_context())
        except Conversation.DoesNotExist:
            out_serializer = MessageSerializer(message, context=self.get_serializer_context())

        headers = self.get_success_headers(out_serializer.data)
        return Response(out_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def partial_update(self, request, *args, **kwargs):
        message = self.get_object()
        if message.sender != request.user:
            return Response({"detail": "You can only edit your own messages."}, status=status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(message, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(is_edited=True)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        message = self.get_object()
        conversation = message.conversation

        if message.sender != request.user:
            is_owner = (conversation.owner == request.user)
            can_delete = False
            if not is_owner:
                try:
                    membership = ConversationMember.objects.prefetch_related('roles').get(
                        conversation=conversation,
                        user=request.user
                    )
                    if membership.roles.filter(can_delete_messages=True).exists():
                        can_delete = True
                except ConversationMember.DoesNotExist:
                    pass
            if not (is_owner or can_delete):
                return Response(
                    {"detail": "You do not have permission to delete this message."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        message.is_deleted = True
        message.content = ""
        message.save(update_fields=["is_deleted", "content", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def search(self, request, conversation_pk=None):
        query = request.query_params.get('q', '').strip()
        if len(query) < 3:
            return Response({"detail": "Search query must be at least 3 characters."}, status=status.HTTP_400_BAD_REQUEST)
        conversation = get_object_or_404(Conversation, id=conversation_pk, members__user=request.user)
        messages = Message.objects.filter(
            conversation=conversation, is_deleted=False, content__icontains=query
        ).order_by('-created_at')
        serializer = MinimalMessageSerializer(messages, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ConversationListView(ListAPIView):
    serializer_class = ConversationListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        # Subquery to get the timestamp of the user's last_read_message
        last_read_created = Subquery(
            ConversationMember.objects.filter(
                conversation=OuterRef('id'),
                user=user
            ).values('last_read_message__created_at')[:1]
        )

        queryset = Conversation.objects.filter(
            members__user=user
        ).annotate(
            unread_count=Count(
                'messages',
                filter=Q(
                    messages__created_at__gt=Coalesce(last_read_created, Value('1970-01-01'))
                )
            )
        ).distinct()

        # Prefetch the latest message
        queryset = queryset.prefetch_related(
            Prefetch(
                'messages',
                queryset=Message.objects
                    .filter(is_deleted=False)
                    .order_by('-created_at')[:1],  # <--- correct place to slice
                to_attr='_last_message_prefetched'
            )
        )

        # Prefetch members with user details for DM name/avatar
        queryset = queryset.prefetch_related(
            Prefetch(
                'members',
                queryset=ConversationMember.objects.select_related('user')
            )
        )

        return queryset


class ConversationMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        try:
            conversation = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Response({"detail": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)

        # Ensure user is a member
        try:
            member = ConversationMember.objects.get(conversation=conversation, user=request.user)
        except ConversationMember.DoesNotExist:
            return Response({"detail": "You are not a member of this conversation."}, status=status.HTTP_403_FORBIDDEN)

        serializer = ConversationMarkReadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        message_id = serializer.validated_data['last_read_message_id']
        try:
            message = Message.objects.get(id=message_id, conversation=conversation)
        except Message.DoesNotExist:
            return Response({"detail": "Message not found in this conversation."}, status=status.HTTP_404_NOT_FOUND)

        member.last_read_message = message
        member.save(update_fields=['last_read_message'])
        return Response({"detail": "Read status updated."}, status=status.HTTP_200_OK)


class GroupCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = GroupCreateSerializer(
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        conversation = serializer.save()

        detail_serializer = GroupDetailSerializer(conversation)
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED)



class GroupJoinView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, invite_token):
        try:
            conversation = Conversation.objects.get(
                invite_token=invite_token,
                type=Conversation.Type.GROUP
            )
        except Conversation.DoesNotExist:
            return Response(
                {"detail": "This invite link is invalid or has expired."},
                status=status.HTTP_404_NOT_FOUND
            )

        user = request.user

        if ConversationMember.objects.filter(conversation=conversation, user=user).exists():
            return Response(
                {"detail": "You are already a member of this group."},
                status=status.HTTP_400_BAD_REQUEST
            )

        role, _ = Role.objects.get_or_create(
            conversation=conversation,
            name='Member',
            defaults={
                'can_send_messages': True,
                'can_send_media': True,
                'can_delete_messages': False,
                'can_manage_members': False,
                'can_manage_roles': False,
                'can_view_invite_link':True,
                'can_edit_channel_info':True,
            }
        )

        member = ConversationMember.objects.create(conversation=conversation, user=user)
        member.roles.add(role)

        serializer = GroupDetailSerializer(conversation, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

class GroupProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.GROUP,
            members__user=request.user
        )

        serializer = GroupDetailSerializer(
            conversation,
            context={'request': request}
        )

        return Response(serializer.data)

class GroupMembersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):

        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.GROUP
        )

        # فقط اعضای گروه اجازه مشاهده دارند
        is_member = ConversationMember.objects.filter(
            conversation=conversation,
            user=request.user
        ).exists()

        if not is_member:
            return Response(
                {"detail": "You are not a member of this group."},
                status=status.HTTP_403_FORBIDDEN
            )

        members = ConversationMember.objects.filter(
            conversation=conversation
        ).select_related(
            'user'
        )
        members.prefetch_related('roles')

        serializer = GroupMemberSerializer(
            members,
            many=True
        )

        return Response(serializer.data)


class GroupUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, conversation_id):

        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.GROUP,
        )

        if not ConversationMember.objects.filter(
            conversation=conversation,
            user=request.user,
        ).exists():
            return Response(
                {"detail": "You are not a member of this group."},
                status=403,
            )

        serializer = GroupUpdateSerializer(
            conversation,
            data=request.data,
            partial=True,
        )

        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(
            GroupDetailSerializer(conversation).data
        )

class GroupDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, conversation_id):
        group = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.GROUP,
        )

        # Check that the requesting user is a member of the group
        if not ConversationMember.objects.filter(
            conversation=group,
            user=request.user
        ).exists():
            return Response(
                {"detail": "You are not a member of this group."},
                status=status.HTTP_403_FORBIDDEN,
            )

        group.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChannelCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = ChannelCreateSerializer(
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        conversation = serializer.save()

        # Retrieve the channel profile for invite link
        channel = conversation.channel
        invite_link = request.build_absolute_uri(
            f'/api/chat/invite/{channel.invite_code}/'
        )
        # Or you may want a frontend deep link; adjust as needed.

        return Response(
            {
                'id': conversation.id,
                'name': conversation.name,
                'description': conversation.description,
                'avatar_url': conversation.avatar_url,
                'is_private': channel.is_private,
                'public_id': channel.public_id,
                'invite_link': invite_link,
                'owner_id': request.user.id,
            },
            status=status.HTTP_201_CREATED
        )

class ChannelProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):

        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL,
        )

        if not ConversationMember.objects.filter(
            conversation=conversation,
            user=request.user,
        ).exists():
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ChannelDetailSerializer(
            conversation,
            context={"request": request},
        )

        return Response(serializer.data)



class ChannelJoinView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, invite_code):

        try:
            channel = Channel.objects.select_related('conversation').get(invite_code=invite_code)
        except Channel.DoesNotExist:
            return Response(
                {"detail": "Invalid link."},
                status=status.HTTP_404_NOT_FOUND
            )

        conversation = channel.conversation
        return Response({
            "name": conversation.name,
            "avatar_url": conversation.avatar_url,
            "description": conversation.description,
        }, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request, invite_code):

        try:
            channel = Channel.objects.select_related('conversation').get(invite_code=invite_code)
        except Channel.DoesNotExist:
            return Response(
                {"detail": "Invalid link."},
                status=status.HTTP_404_NOT_FOUND
            )

        conversation = channel.conversation
        user = request.user

        if ConversationMember.objects.filter(conversation=conversation, user=user).exists():
            return Response(
                {"detail": "You are already a member of this channel."},
                status=status.HTTP_400_BAD_REQUEST
            )

        role, _ = Role.objects.get_or_create(
            conversation=conversation,
            name='Channel Member',
            defaults={
                'can_send_messages': False,
                'can_send_media': False,
                'can_delete_messages': False,
                'can_manage_members': False,
                'can_manage_roles': False,
                'can_view_invite_link':False,
                'can_edit_channel_info':False,
                'can_delete_channel':False,
            }
        )

        member = ConversationMember.objects.create(conversation=conversation, user=user)
        member.roles.add(role)

        serializer = ChannelDetailSerializer(conversation, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class ChannelPublicIdView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, public_id):

        try:
            channel = Channel.objects.select_related('conversation').get(
                public_id=public_id,
                is_private=False
            )
        except Channel.DoesNotExist:
            return Response(
                {"detail": "Channel not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        conversation = channel.conversation
        return Response({
            "id": conversation.id,
            "name": conversation.name,
            "avatar_url": conversation.avatar_url,
            "description": conversation.description,
            "public_id": channel.public_id,
        }, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request, public_id):

        try:
            channel = Channel.objects.select_related('conversation').get(
                public_id=public_id,
                is_private=False
            )
        except Channel.DoesNotExist:
            return Response(
                {"detail": "Channel not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        conversation = channel.conversation
        user = request.user

        if ConversationMember.objects.filter(conversation=conversation, user=user).exists():
            return Response(
                {"detail": "You are already a member of this channel."},
                status=status.HTTP_400_BAD_REQUEST
            )

        role, _ = Role.objects.get_or_create(
            conversation=conversation,
            name='Channel Member',
            defaults={
                'can_send_messages': False,
                'can_send_media': False,
                'can_delete_messages': False,
                'can_manage_members': False,
                'can_manage_roles': False,
                'can_view_invite_link':True,
                'can_edit_channel_info':True
            }
        )

        member = ConversationMember.objects.create(conversation=conversation, user=user)
        member.roles.add(role)

        serializer = ChannelDetailSerializer(conversation, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class ChannelUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL,
        )

        try:
            member = ConversationMember.objects.prefetch_related('roles').get(
                conversation=conversation,
                user=request.user
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN,
            )

        can_edit_channel = member.roles.filter(can_edit_channel_info=True).exists()

        if not (can_edit_channel):
            return Response(
                {"detail": "You do not have permission to edit this channel's info."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ChannelUpdateSerializer(
            conversation,
            data=request.data,
            partial=True,
        )

        serializer.is_valid(raise_exception=True)
        serializer.save()

        detail_serializer = ChannelDetailSerializer(conversation, context={"request": request})
        return Response(detail_serializer.data, status=status.HTTP_200_OK)


class ChannelMembersListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL,
        )

        try:
            requesting_member = ConversationMember.objects.prefetch_related('roles').get(
                conversation=conversation,
                user=request.user
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN,
            )

        is_owner = (conversation.owner == request.user)
        can_manage = requesting_member.roles.filter(can_manage_members=True).exists()
        if not (is_owner or can_manage):
            return Response(
                {"detail": "You do not have permission to view the members list."},
                status=status.HTTP_403_FORBIDDEN,
            )

        members = ConversationMember.objects.filter(
            conversation=conversation
        ).select_related('user')
        members.prefetch_related('roles')

        serializer = ChannelMemberSerializer(members, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ChannelRemoveMemberView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, conversation_id, user_id):
        conversation = get_object_or_404(Conversation, id=conversation_id)
        if conversation.type != Conversation.Type.CHANNEL:
            return Response({"detail": "Not a channel."}, status=status.HTTP_404_NOT_FOUND)

        try:
            requester_membership = ConversationMember.objects.prefetch_related('roles').get(
                conversation=conversation,
                user=request.user
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN
            )

        is_owner = (conversation.owner == request.user)
        can_manage = requester_membership.roles.filter(can_manage_members=True).exists()
        if not (is_owner or can_manage):
            return Response(
                {"detail": "You do not have permission to remove users."},
                status=status.HTTP_403_FORBIDDEN
            )

        if conversation.owner and str(conversation.owner.id) == str(user_id):
            return Response(
                {"detail": "The channel owner cannot be removed."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if str(request.user.id) == str(user_id):
            return Response(
                {"detail": "You cannot kick yourself. Please use the leave option."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            target_membership = ConversationMember.objects.get(
                conversation=conversation,
                user_id=user_id
            )
            target_membership.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "User is not a member of this channel."},
                status=status.HTTP_404_NOT_FOUND
            )


class ChannelMemberRoleUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, conversation_id, user_id):
        conversation = get_object_or_404(Conversation, id=conversation_id)
        if conversation.type != Conversation.Type.CHANNEL:
            return Response({"detail": "Not a channel."}, status=status.HTTP_404_NOT_FOUND)

        try:
            requester_membership = ConversationMember.objects.prefetch_related('roles').get(
                conversation=conversation,
                user=request.user
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN
            )

        is_owner = (conversation.owner == request.user)
        can_manage_roles = requester_membership.roles.filter(can_manage_roles=True).exists()

        if not (is_owner or can_manage_roles):
            return Response(
                {"detail": "You do not have permission to manage roles."},
                status=status.HTTP_403_FORBIDDEN
            )

        if conversation.owner and str(conversation.owner.id) == str(user_id):
            return Response(
                {"detail": "You cannot change the role of the channel owner."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            target_membership = ConversationMember.objects.get(
                conversation=conversation,
                user_id=user_id
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "Target user is not a member of this channel."},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = ChannelMemberRoleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role_id = serializer.validated_data['role_id']

        try:
            role = Role.objects.get(id=role_id, conversation=conversation)
        except Role.DoesNotExist:
            return Response(
                {"detail": "Role not found in this channel."},
                status=status.HTTP_404_NOT_FOUND
            )

        target_membership.roles.add(role)

        return Response(
            {"detail": "Role updated successfully."},
            status=status.HTTP_200_OK
        )

class ChannelDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, conversation_id):
        conversation = get_object_or_404(Conversation, id=conversation_id)
        if conversation.type != Conversation.Type.CHANNEL:
            return Response({"detail": "Not a channel."}, status=status.HTTP_404_NOT_FOUND)

        try:
            membership = ConversationMember.objects.prefetch_related('roles').get(
                conversation=conversation,
                user=request.user
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN
            )

        is_owner = (conversation.owner == request.user)

        can_delete = membership.roles.filter(Q(can_delete_channel=True) | Q(can_manage_roles=True)).exists()
        if not (is_owner or can_delete):
            return Response(
                {"detail": "You do not have permission to delete this channel."},
                status=status.HTTP_403_FORBIDDEN
            )

        conversation.delete()

        return Response(
            {"detail": "Channel deleted successfully."},
            status=status.HTTP_204_NO_CONTENT
        )
class ChannelMyPermissionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL
        )

        permissions = {
            "is_owner": False,
            "can_send_messages": False,
            "can_send_media": False,
            "can_delete_messages": False,
            "can_manage_members": False,
            "can_manage_roles": False,
            "can_view_invite_link": False,
            "can_edit_channel_info": False,
            "can_delete_channel": False,
            "can_create_topic": False,
            "can_manage_others_topics": False,
        }

        if conversation.owner == request.user:
            for key in permissions.keys():
                permissions[key] = True
            return Response(permissions, status=status.HTTP_200_OK)

        try:
            member = ConversationMember.objects.prefetch_related('roles').get(
                conversation=conversation,
                user=request.user
            )

            roles = member.roles.all()

            permissions = {
                "is_owner": False, # یا بررسی منطق مالکیت مانند: member.is_owner
                "can_send_messages": any(r.can_send_messages for r in roles),
                "can_send_media": any(r.can_send_media for r in roles),
                "can_delete_messages": any(r.can_delete_messages for r in roles),
                "can_manage_members": any(r.can_manage_members for r in roles),
                "can_manage_roles": any(r.can_manage_roles for r in roles),
                "can_view_invite_link": any(r.can_view_invite_link for r in roles),
                "can_edit_channel_info": any(r.can_edit_channel_info for r in roles),
                "can_delete_channel": any(r.can_delete_channel for r in roles),
                "can_create_topic": any(r.can_create_topic for r in roles),
                "can_manage_others_topics": any(r.can_manage_others_topics for r in roles),
            }

            return Response(permissions, status=status.HTTP_200_OK)

        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN
            )

class ChannelPreviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, invite_code):
        try:
            channel = Channel.objects.select_related('conversation').get(invite_code=invite_code)
        except Channel.DoesNotExist:
            return Response(
                {"detail": "Invalid invite link or channel does not exist."},
                status=status.HTTP_404_NOT_FOUND
            )

        conversation = channel.conversation

        messages = Message.objects.filter(
            conversation=conversation,
            is_deleted=False
        ).select_related('sender').order_by('created_at')

        message_serializer = MessageSerializer(messages, many=True, context={'request': request})

        preview_data = {
            "id": conversation.id,
            "name": conversation.name,
            "description": conversation.description,
            "avatar_url": conversation.avatar_url,
            "is_private": channel.is_private,
            "public_id": channel.public_id,
            "messages": message_serializer.data,
        }

        return Response(preview_data, status=status.HTTP_200_OK)


class ChannelRolesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL,
        )
        if conversation.owner != request.user:
            return Response(
                {"detail": "Only the channel owner can manage roles."},
                status=status.HTTP_403_FORBIDDEN,
            )
        default_roles = ['Member', 'Owner']
        roles = Role.objects.filter(conversation=conversation).exclude(name__in=default_roles)
        
        serializer = RoleSerializer(roles, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
    def post(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL,
        )
        if conversation.owner != request.user:
            return Response(
                {"detail": "Only the channel owner can manage roles."},
                status=status.HTTP_403_FORBIDDEN,
            )

        name = request.data.get('name')
        if not name or not name.strip():
            return Response(
                {"name": "Role name is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
            
        clean_name = name.strip()
        
        if len(clean_name) > 100:
            return Response(
                {"name": "Role name cannot exceed 100 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if Role.objects.filter(conversation=conversation, name__iexact=clean_name).exists():
            return Response(
                {"name": "A role with this name already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        role = Role.objects.create(conversation=conversation, name=clean_name)
        serializer = RoleSerializer(role)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
class ChannelRoleDetailView(APIView):
    permission_classes = [IsAuthenticated]
    
    PROTECTED_ROLES = ['Member', 'Channel Member', 'Owner', 'Channel Owner', 'Group Owner'] 

    def get_role(self, conversation_id, role_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL,
        )
        if conversation.owner != self.request.user:
            raise PermissionDenied("Only the channel owner can manage roles.")
            
        role = get_object_or_404(Role, id=role_id, conversation=conversation)
        return role

    def get(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation, 
            id=conversation_id, 
            type=Conversation.Type.CHANNEL
        )
        
        PROTECTED_ROLES = ['Member', 'Owner', 'Channel Owner']
        
        roles = Role.objects.filter(conversation=conversation).exclude(name__in=PROTECTED_ROLES)
        
        serializer = RoleSerializer(roles, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    def patch(self, request, conversation_id, role_id):
        role = self.get_role(conversation_id, role_id)

        if role.name in self.PROTECTED_ROLES:
            return Response(
                {"detail": "Cannot edit the Channel Owner role."},  
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = RoleSerializer(role, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, conversation_id, role_id):
        role = self.get_role(conversation_id, role_id)
        if role.name in self.PROTECTED_ROLES:
            return Response(
                {"detail": "Cannot delete the Channel Owner role."},
                status=status.HTTP_400_BAD_REQUEST  
            )

        role.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    
class TopicListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL,
            members__user=request.user,
        )
        topics = conversation.topics.all().order_by('created_at')
        serializer = TopicSerializer(topics, many=True)
        return Response(serializer.data)

    def post(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL,
            members__user=request.user,
        )
        member = ConversationMember.objects.get(conversation=conversation, user=request.user)
        if not member.roles.filter(can_create_topic=True).exists():
            raise PermissionDenied("You do not have permission to create topics.")

        serializer = TopicCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        topic = serializer.save(conversation=conversation, creator=request.user)
        output = TopicSerializer(topic)
        return Response(output.data, status=status.HTTP_201_CREATED)




class TopicDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_topic(self, conversation_id, topic_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL,
            members__user=self.request.user,
        )
        return get_object_or_404(Topic, id=topic_id, conversation=conversation)

    def get(self, request, conversation_id, topic_id):
        topic = self.get_topic(conversation_id, topic_id)
        serializer = TopicSerializer(topic)
        return Response(serializer.data)

    def patch(self, request, conversation_id, topic_id):
        topic = self.get_topic(conversation_id, topic_id)
        member = ConversationMember.objects.get(conversation=topic.conversation, user=request.user)

        is_owner = (topic.conversation.owner == request.user)
        is_creator = (topic.creator == request.user)
        can_manage = member.roles.filter(can_manage_others_topics=True).exists()

        if not (is_owner or is_creator or can_manage):
            raise PermissionDenied("You do not have permission to edit this topic.")

        serializer = TopicUpdateSerializer(topic, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        topic = serializer.save()
        return Response(TopicSerializer(topic).data)

    def delete(self, request, conversation_id, topic_id):
        topic = self.get_topic(conversation_id, topic_id)
        member = ConversationMember.objects.get(conversation=topic.conversation, user=request.user)

        is_owner = (topic.conversation.owner == request.user)
        is_creator = (topic.creator == request.user)
        can_manage = member.roles.filter(can_manage_others_topics=True).exists()

        if not (is_owner or is_creator or can_manage):
            raise PermissionDenied("You do not have permission to delete this topic.")

        topic.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class AttachmentDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, attachment_id):
        attachment = get_object_or_404(Attachment.objects.select_related(
            'message__conversation'
        ), id=attachment_id)

        # Verify the requesting user is a member of the conversation
        conversation = attachment.message.conversation
        if not ConversationMember.objects.filter(
            conversation=conversation,
            user=request.user
        ).exists():
            return Response(
                {"detail": "You do not have access to this file."},
                status=status.HTTP_403_FORBIDDEN,
            )

        file_field = attachment.file
        if not file_field:
            return Response(
                {"detail": "File not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Determine MIME type from the original filename
        mime_type, _ = mimetypes.guess_type(attachment.original_filename)
        if not mime_type:
            mime_type = 'application/octet-stream'

        # Open the file from storage and serve it as an attachment
        try:
            file_handle = file_field.open('rb')
        except FileNotFoundError:
            return Response(
                {"detail": "File not found on storage."},
                status=status.HTTP_404_NOT_FOUND,
            )

        response = FileResponse(
            file_handle,
            content_type=mime_type,
            as_attachment=True,
            filename=attachment.original_filename,
        )
        return response



class ChannelMemberRoleRemoveView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, conversation_id, user_id, role_id):
        conversation = get_object_or_404(Conversation, id=conversation_id)
        if conversation.type != Conversation.Type.CHANNEL:
            return Response({"detail": "Not a channel."}, status=status.HTTP_404_NOT_FOUND)

        try:
            requester_membership = ConversationMember.objects.prefetch_related('roles').get(
                conversation=conversation,
                user=request.user
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN
            )

        is_owner = (conversation.owner == request.user)
        can_manage_roles = requester_membership.roles.filter(can_manage_roles=True).exists()

        if not (is_owner or can_manage_roles):
            return Response(
                {"detail": "You do not have permission to manage roles."},
                status=status.HTTP_403_FORBIDDEN
            )

        if conversation.owner and str(conversation.owner.id) == str(user_id):
            return Response(
                {"detail": "You cannot change the role of the channel owner."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            target_membership = ConversationMember.objects.get(
                conversation=conversation,
                user_id=user_id
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "Target user is not a member of this channel."},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            role = Role.objects.get(id=role_id, conversation=conversation)
        except Role.DoesNotExist:
            return Response(
                {"detail": "Role not found in this channel."},
                status=status.HTTP_404_NOT_FOUND
            )

        target_membership.roles.remove(role)

        return Response(
            {"detail": "Role removed successfully."},
            status=status.HTTP_200_OK
        )


class NotificationListView(ListAPIView):
    """List all notifications for the authenticated user."""
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user)


class NotificationMarkReadView(UpdateAPIView):
    """Mark a specific notification as read."""
    permission_classes = [IsAuthenticated]
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    lookup_field = 'id'

    def perform_update(self, serializer):
        serializer.save(is_read=True)

    def get_queryset(self):
        # Users can only update their own notifications
        return super().get_queryset().filter(recipient=self.request.user)


class NotificationMarkAllReadView(APIView):
    """Mark all notifications as read for the authenticated user."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        count = Notification.objects.filter(
            recipient=request.user,
            is_read=False
        ).update(is_read=True)
        return Response({'marked_read_count': count})


class UnreadNotificationCountView(APIView):
    """Get the count of unread notifications."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(
            recipient=request.user,
            is_read=False
        ).count()
        return Response({'unread_count': count})


class ScheduledMessageCreateView(CreateAPIView):
    """
    Schedule a message for future delivery.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ScheduledMessageSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        conversation_id = self.kwargs.get('conversation_id')
        context['conversation'] = get_object_or_404(Conversation, id=conversation_id)
        return context

    def perform_create(self, serializer):
        conversation_id = self.kwargs.get('conversation_id')
        conversation = get_object_or_404(Conversation, id=conversation_id)

        # Check membership
        if not ConversationMember.objects.filter(
                conversation=conversation,
                user=self.request.user
        ).exists():
            raise PermissionDenied("You are not a member of this conversation.")

        # For channels, check if user has permission to send messages
        if conversation.type == Conversation.Type.CHANNEL:
            try:
                member = ConversationMember.objects.prefetch_related('roles').get(
                    conversation=conversation,
                    user=self.request.user
                )
                if not member.roles.filter(can_send_messages=True).exists():
                    raise PermissionDenied(
                        "You do not have permission to send messages in this channel."
                    )
            except ConversationMember.DoesNotExist:
                raise PermissionDenied("You are not a member of this channel.")

        # Check if scheduled time is in the future (already validated by serializer)
        serializer.save(sender=self.request.user, conversation=conversation)


class ScheduledMessageListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ScheduledMessageSerializer

    def get_queryset(self):
        # By default show pending (not sent, not failed)
        # Could add query param to show all
        return ScheduledMessage.objects.filter(
            sender=self.request.user,
            sent=False,
            failed=False
        ).order_by('scheduled_at')


class ScheduledMessageDeleteView(DestroyAPIView):
    """
    Delete a scheduled message (only if not sent yet).
    """
    permission_classes = [IsAuthenticated]
    queryset = ScheduledMessage.objects.all()
    lookup_field = 'id'

    def get_queryset(self):
        return super().get_queryset().filter(
            sender=self.request.user,
            sent=False
        )

    def delete(self, request, *args, **kwargs):
        instance = self.get_object()
        # Also delete associated attachments from storage
        for attachment in instance.attachments.all():
            if attachment.file:
                try:
                    attachment.file.delete(save=False)
                except:
                    pass
        return super().delete(request, *args, **kwargs)


class ScheduledMessageCancelAllView(APIView):
    """
    Cancel all pending scheduled messages for a conversation.
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, conversation_id):
        conversation = get_object_or_404(Conversation, id=conversation_id)

        # Check membership
        if not ConversationMember.objects.filter(
                conversation=conversation,
                user=request.user
        ).exists():
            return Response(
                {"detail": "You are not a member of this conversation."},
                status=status.HTTP_403_FORBIDDEN
            )

        scheduled_messages = ScheduledMessage.objects.filter(
            conversation=conversation,
            sender=request.user,
            sent=False
        )

        # Delete attachments from storage
        for sm in scheduled_messages:
            for attachment in sm.attachments.all():
                if attachment.file:
                    try:
                        attachment.file.delete(save=False)
                    except:
                        pass

        count = scheduled_messages.count()
        scheduled_messages.delete()

        return Response(
            {"detail": f"Cancelled {count} scheduled messages."},
            status=status.HTTP_200_OK
        )


class ScheduledMessageRetryView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        ScheduledMessage.objects.filter(
            id=id,
            sender=request.user,
            failed=True,
            sent=False
        ).update(
            failed=False,
            failure_reason=None
        )
        return Response({"detail": "Scheduled message will be retried."})