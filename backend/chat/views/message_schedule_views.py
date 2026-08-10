from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import CreateAPIView, ListAPIView, DestroyAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from chat.models import Conversation, ConversationMember, ScheduledMessage
from chat.scheduled_messages_serializers import ScheduledMessageSerializer


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
