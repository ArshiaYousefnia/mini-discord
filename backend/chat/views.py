from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets, mixins
from rest_framework.response import Response

from rest_framework.views import APIView

from .serializers import MessageSerializer, ConversationSerializer, ConversationMarkReadSerializer

from django.contrib.auth import get_user_model

from django.db.models import OuterRef, Subquery, Count, Q, Value, Prefetch
from django.db.models.functions import Coalesce
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from .models import Conversation, ConversationMember, Message, Role 

from .serializers import ConversationListSerializer, GroupCreateSerializer, GroupDetailSerializer


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
        message = serializer.save(sender=request.user)

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


class MessageViewSet(
    mixins.ListModelMixin,
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
            return Response(
                {"detail": "You can only delete your own messages."},
                status=status.HTTP_403_FORBIDDEN
            )

        message.is_deleted = True
        message.content = ""
        message.save(update_fields=["is_deleted", "content", "updated_at"])


        return Response(status=status.HTTP_204_NO_CONTENT)


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