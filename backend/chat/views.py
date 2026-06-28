from django.shortcuts import render

from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from .models import Message
from .serializers import MessageEditSerializer
from .permissions import IsMessageOwner


class EditMessageView(generics.UpdateAPIView):
    serializer_class = MessageEditSerializer
    permission_classes = [IsAuthenticated, IsMessageOwner]
    queryset = Message.objects.all()
    lookup_field = "id"
    lookup_url_kwarg = "message_id"

    def perform_update(self, serializer):
        serializer.save()  