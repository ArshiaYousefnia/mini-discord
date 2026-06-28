from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Message
from .permissions import IsMessageOwner


class DeleteMessageView(generics.DestroyAPIView):
    queryset = Message.objects.all()
    permission_classes = [IsAuthenticated, IsMessageOwner]
    lookup_field = "id"
    lookup_url_kwarg = "message_id"

    def perform_destroy(self, instance):
        instance.delete()  

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)

        return Response(
            {"detail": "Message deleted successfully."},
            status=status.HTTP_200_OK
        )