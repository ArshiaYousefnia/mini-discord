from rest_framework.generics import ListAPIView, UpdateAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from chat.models import Notification
from chat.serializers import NotificationSerializer


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
