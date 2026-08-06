from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from chat.models import Conversation, ConversationMember, Topic
from chat.serializers import TopicSerializer, TopicCreateSerializer, TopicUpdateSerializer


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
