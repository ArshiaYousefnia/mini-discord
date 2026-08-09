import mimetypes

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.http import FileResponse
from django.db import transaction
from rest_framework import status, viewsets, mixins
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response

from chat.serializers import NotificationSerializer

from rest_framework.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404

from chat.views import (
    broadcast_new_message,
    broadcast_notification,
    broadcast_conversation_update,
    broadcast_message_deleted,
    broadcast_message_updated
)

from chat.serializers import (
    MessageSerializer,
    ConversationSerializer,
    ConversationMarkReadSerializer,
    MinimalMessageSerializer,
    ChannelMessageSerializer
)

from django.contrib.auth import get_user_model

from django.db.models import OuterRef, Subquery, Count, Q, Value, Prefetch
from django.db.models.functions import Coalesce
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from chat.models import Conversation, ConversationMember, Message, Role, Topic, ChannelMessage, Attachment, \
    Notification

from chat.serializers import ConversationListSerializer
from chat.views.views_realtime_utils import broadcast_unread_update_for_conversation, convert_uuids_to_str, \
    broadcast_user_conversation_removed

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

        # After message creation
        last_message_data = MinimalMessageSerializer(message).data
        broadcast_conversation_update(
            conversation,
            'new_message',
            {'last_message': last_message_data}
        )

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

        # Broadcast member left
        user_id = request.user.id

        broadcast_conversation_update(
            conversation,
            'member_left',
            {'user_id': str(user_id)}
        )

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='remove-member')
    def remove_member(self, request, pk=None):
        conversation = self.get_object()
        if conversation.type != Conversation.Type.GROUP:
            return Response({"detail": "Member removal is only available for groups."},
                            status=status.HTTP_400_BAD_REQUEST)
        if conversation.owner != request.user:
            return Response({"detail": "Only the group owner can remove members."}, status=status.HTTP_403_FORBIDDEN)

        target_user_id = request.data.get('user_id')
        if not target_user_id:
            return Response({"detail": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        membership = ConversationMember.objects.filter(conversation=conversation, user_id=target_user_id).first()
        if not membership:
            return Response({"detail": "This user is not a member of the group."}, status=status.HTTP_404_NOT_FOUND)

        if str(target_user_id) == str(request.user.id):
            return Response({"detail": "You cannot remove yourself. Use the leave action instead."},
                            status=status.HTTP_400_BAD_REQUEST)

        membership.delete()

        broadcast_user_conversation_removed(target_user_id, conversation)

        # Broadcast member left
        broadcast_conversation_update(
            conversation,
            'member_left',
            {'user_id': str(target_user_id)}
        )

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

        base_queryset = Message.objects.filter(
            conversation_id=conversation_id,
            conversation__members__user=self.request.user,
            is_deleted=False
        ).select_related('sender').order_by("created_at")

        if conv.type == Conversation.Type.CHANNEL:
            return ChannelMessage.objects.filter(
                conversation_id=conversation_id,
                conversation__members__user=self.request.user,
                is_deleted=False
            ).select_related('sender', 'topic').order_by("created_at")

        return base_queryset

    def perform_create(self, serializer):
        conversation_id = self.kwargs.get("conversation_pk")
        conversation = get_object_or_404(Conversation, id=conversation_id)

        # Membership check
        if not ConversationMember.objects.filter(
                conversation=conversation, user=self.request.user
        ).exists():
            raise PermissionDenied("You are not a member of this conversation.")

        topic = None
        content = serializer.validated_data.get('content')
        uploaded_files = serializer.validated_data.get('uploaded_files', [])

        # Channel permission checks (separate for text vs media)
        if conversation.type == Conversation.Type.CHANNEL:
            member = ConversationMember.objects.get(
                conversation=conversation,
                user=self.request.user
            )

            # Get permissions
            can_send_messages = member.roles.filter(can_send_messages=True).exists()
            can_send_media = member.roles.filter(can_send_media=True).exists()

            # Text message permission
            if content and content.strip():
                if not can_send_messages:
                    raise PermissionDenied("You do not have permission to send text messages.")

            # Media permission
            if uploaded_files:
                if not can_send_media:
                    raise PermissionDenied("You do not have permission to send media files.")

            # Topic handling (unchanged)
            topic_id = self.request.data.get('topic_id')
            if topic_id:
                topic = get_object_or_404(Topic, id=topic_id, conversation=conversation)

        # Create the message (choose ChannelMessage if channel)
        if conversation.type == Conversation.Type.CHANNEL:
            message = ChannelMessage.objects.create(
                conversation=conversation,
                sender=self.request.user,
                content=content,
                reply_to=serializer.validated_data.get('reply_to'),
                topic=topic,
            )
        else:
            message = serializer.save(
                sender=self.request.user, conversation=conversation
            )

        # Handle uploaded files (create Attachments)
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

        # After message creation
        last_message_data = MinimalMessageSerializer(message).data
        broadcast_conversation_update(
            conversation,
            'new_message',
            {'last_message': last_message_data}
        )

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
        updated_message = serializer.save(is_edited=True)

        conversation = updated_message.conversation

        channel_layer = get_channel_layer()
        if conversation.type == Conversation.Type.CHANNEL:
            data = ChannelMessageSerializer(updated_message).data
        else:
            data = MessageSerializer(updated_message).data
        data = convert_uuids_to_str(data)
        async_to_sync(channel_layer.group_send)(
            f"conversation_{conversation.id}",
            {
                "type": "message_updated",
                "data": data
            }
        )

        # 2. Broadcast conversation_update to update sidebar preview
        last_msg = conversation.messages.filter(is_deleted=False).order_by('-created_at').first()
        last_message_data = MinimalMessageSerializer(last_msg).data if last_msg else None
        broadcast_conversation_update(
            conversation,
            'message_updated',
            {'last_message': last_message_data}
        )

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

        channel_layer = get_channel_layer()
        data = {'id': str(message.id)}
        async_to_sync(channel_layer.group_send)(
            f"conversation_{conversation.id}",
            {
                "type": "message_deleted",
                "data": data
            }
        )

        last_msg = conversation.messages.filter(is_deleted=False).order_by('-created_at').first()
        last_message_data = MinimalMessageSerializer(last_msg).data if last_msg else None
        broadcast_conversation_update(
            conversation,
            'message_deleted',
            {'last_message': last_message_data}
        )

        broadcast_unread_update_for_conversation(conversation)

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
                    messages__created_at__gt=Coalesce(last_read_created, Value('1970-01-01')),
                    messages__is_deleted=False
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

        broadcast_unread_update_for_conversation(conversation)

        return Response({"detail": "Read status updated."}, status=status.HTTP_200_OK)


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

        # Broadcast role update to all members
        broadcast_conversation_update(
            conversation,
            'role_updated',
            {
                'user_id': str(target_membership.user_id),
                'role_ids': [str(r.id) for r in target_membership.roles.all()],
                'action': 'remove'
            }
        )

        return Response(
            {"detail": "Role removed successfully."},
            status=status.HTTP_200_OK
        )
