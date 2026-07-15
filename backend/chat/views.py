from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets, mixins
from rest_framework.decorators import action
from rest_framework.response import Response

from rest_framework.views import APIView

from .serializers import MessageSerializer, ConversationSerializer, ConversationMarkReadSerializer, \
    MinimalMessageSerializer, ChannelCreateSerializer

from django.contrib.auth import get_user_model

from django.db.models import OuterRef, Subquery, Count, Q, Value, Prefetch
from django.db.models.functions import Coalesce
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from .models import Conversation, ConversationMember, Message, Role , Channel

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
        content = request.data.get('content')
        reply_to = request.data.get('reply_to')

        if not recipient_id:
            return Response(
                {"recipient_id": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not content:
            return Response(
                {"content": "Message content is required."},
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
        # A DM has exactly two members (the sender and recipient)
        conversation = Conversation.objects.filter(
            type=Conversation.Type.DM,
            members__user=request.user
        ).filter(
            members__user=recipient
        ).distinct().first()

        # If not found, create a new DM conversation and add both members
        if not conversation:
            conversation = Conversation.objects.create(type=Conversation.Type.DM)
            # Add both users as members
            ConversationMember.objects.create(conversation=conversation, user=request.user)
            ConversationMember.objects.create(conversation=conversation, user=recipient)

        # Validate message content via serializer
        serializer = self.get_serializer(data={
            'conversation': str(conversation.id),  # Need to pass UUID as string
            'content': content,
            'reply_to': reply_to,

        })
        serializer.is_valid(raise_exception=True)

        # Save with sender = request.user
        message = serializer.save(sender=request.user, conversation=conversation)

        # update last_read_message for sender (so they mark own message as read)
        # Not required for the story, but useful later
        member = ConversationMember.objects.get(conversation=conversation, user=request.user)
        member.last_read_message = message
        member.save()

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
    serializer_class = MessageSerializer

    def get_queryset(self):
        conversation_id = self.kwargs.get("conversation_pk")

        return Message.objects.filter(
            conversation_id=conversation_id,
            conversation__members__user=self.request.user,
            is_deleted=False
        ).order_by("created_at")
    
    def perform_create(self, serializer):
        conversation_id = self.kwargs.get("conversation_pk")
        
        # Verify the conversation exists and the user is a member
        conversation = get_object_or_404(
            Conversation, 
            id=conversation_id, 
            members__user=self.request.user
        )
        
        # Save the message with the sender and conversation
        message = serializer.save(sender=self.request.user, conversation=conversation)

        member = ConversationMember.objects.get(
            conversation=conversation, user=self.request.user
        )
        member.last_read_message = message
        member.save(update_fields=['last_read_message'])

    def partial_update(self, request, *args, **kwargs):
        message = self.get_object()

        # ownership check
        if message.sender != request.user:
            return Response(
                {"detail": "You can only edit your own messages."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = self.get_serializer(
            message,
            data=request.data,
            partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(is_edited=True)
        return Response(serializer.data)
    

    def destroy(self, request, *args, **kwargs):
        message = self.get_object()

        if message.sender != request.user:
            if (
                message.conversation.type != Conversation.Type.GROUP
                or message.conversation.owner != request.user
            ):
                return Response(
                    {"detail": "You do not have permission to delete this message."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        message.is_deleted = True
        message.content = ""
        message.save(update_fields=["is_deleted", "content", "updated_at"])

        return Response(status=status.HTTP_204_NO_CONTENT)

    def search(self, request, conversation_pk=None):
        """
        Search messages in a conversation. Query param: q (min 3 chars).
        """
        query = request.query_params.get('q', '').strip()
        if len(query) < 3:
            return Response(
                {"detail": "Search query must be at least 3 characters."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Ensure user is a member
        conversation = get_object_or_404(
            Conversation,
            id=conversation_pk,
            members__user=request.user
        )

        messages = Message.objects.filter(
            conversation=conversation,
            is_deleted=False,
            content__icontains=query
        ).order_by('-created_at')  # most recent first

        # Use MinimalMessageSerializer to return id, content, sender_display_name, created_at
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
            }
        )

        ConversationMember.objects.create(
            conversation=conversation,
            user=user,
            role=role
        )

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
            'user',
            'role'
        )

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

        if group.owner != request.user:
            return Response(
                {"detail": "Only the group owner can delete the group."},
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
            }
        )

        ConversationMember.objects.create(
            conversation=conversation,
            user=user,
            role=role
        )

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
            }
        )

        ConversationMember.objects.create(
            conversation=conversation,
            user=user,
            role=role
        )

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
            member = ConversationMember.objects.select_related('role').get(
                conversation=conversation,
                user=request.user
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN,
            )

        is_owner = (conversation.owner == request.user)
        has_admin_role = member.role and member.role.can_manage_roles

        if not (is_owner or has_admin_role):
            return Response(
                {"detail": "You do not have permission to edit this channel's info."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # آپدیت اطلاعات
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
            requesting_member = ConversationMember.objects.select_related('role').get(
                conversation=conversation,
                user=request.user
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN,
            )

        is_owner = (conversation.owner == request.user)
        can_manage = requesting_member.role and requesting_member.role.can_manage_members

        if not (is_owner or can_manage):
            return Response(
                {"detail": "You do not have permission to view the members list."},
                status=status.HTTP_403_FORBIDDEN,
            )

        members = ConversationMember.objects.filter(
            conversation=conversation
        ).select_related('user', 'role')

        serializer = ChannelMemberSerializer(members, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
    

class ChannelRemoveMemberView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, conversation_id, user_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL
        )

        try:
            requester_membership = ConversationMember.objects.select_related('role').get(
                conversation=conversation,
                user=request.user
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN
            )

        is_owner = (conversation.owner == request.user)
        can_manage = requester_membership.role and requester_membership.role.can_manage_members

        if not (is_owner or can_manage):
            return Response(
                {"detail": "You do not have permission to remove users."},
                status=status.HTTP_403_FORBIDDEN
            )

        if str(conversation.owner.id) == str(user_id):
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
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL
        )

        try:
            requester_membership = ConversationMember.objects.select_related('role').get(
                conversation=conversation,
                user=request.user
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN
            )

        is_owner = (conversation.owner == request.user)
        can_manage_roles = requester_membership.role and requester_membership.role.can_manage_roles

        if not (is_owner or can_manage_roles):
            return Response(
                {"detail": "You do not have permission to manage roles."},
                status=status.HTTP_403_FORBIDDEN
            )

        if str(conversation.owner.id) == str(user_id):
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

        target_membership.role = role
        target_membership.save(update_fields=['role'])

        return Response(
            {"detail": "Role updated successfully."},
            status=status.HTTP_200_OK
        )
    
class ChannelDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL
        )

        try:
            membership = ConversationMember.objects.select_related('role').get(
                conversation=conversation,
                user=request.user
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN
            )

        is_owner = (conversation.owner == request.user)
        can_delete = membership.role and getattr(membership.role, 'can_delete_channel', False)

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