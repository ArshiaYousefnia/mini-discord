from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Conversation, ConversationMember, Message
from .serializers import MessageSerializer, ConversationSerializer

from django.contrib.auth import get_user_model
User = get_user_model()


class SendDirectMessageView(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = MessageSerializer

    @transaction.atomic
    def create(self, request):
        """
        Send a direct message to another user.
        Expects: { "recipient_id": "<user_uuid>", "content": "Hello" }
        """
        recipient_id = request.data.get('recipient_id')
        content = request.data.get('content')

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
        })
        serializer.is_valid(raise_exception=True)

        # Save with sender = request.user
        message = serializer.save(sender=request.user)

        # Optionally update last_read_message for sender (so they mark own message as read)
        # Not required for the story, but useful later
        # member = ConversationMember.objects.get(conversation=conversation, user=request.user)
        # member.last_read_message = message
        # member.save()

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


class MessageViewSet(mixins.ListModelMixin,
                     viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = MessageSerializer

    def get_queryset(self):
        conversation_id = self.kwargs.get('conversation_pk')
        return Message.objects.filter(
            conversation_id=conversation_id,
            conversation__members__user=self.request.user,
        ).order_by('created_at')