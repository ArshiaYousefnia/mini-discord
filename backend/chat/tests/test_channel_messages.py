import uuid
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from chat.models import (
    Conversation, ConversationMember, Role,
    Channel, Message, ChannelMessage, Topic
)

from rest_framework.test import APITestCase
User = get_user_model()
from chat.models import Topic

class ChannelMessageTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='user', email='user@test.com',password='password')
        self.muted_user = User.objects.create_user(username='muted', email='muted@test.com', password='password')
        self.conversation = Conversation.objects.create(
            name="Test Channel", 
            type=Conversation.Type.CHANNEL
        )
        
        self.topic = Topic.objects.create(conversation=self.conversation, creator=self.user, name="General")
        self.normal_role = Role.objects.create(conversation=self.conversation, name="Member", can_send_messages=True)
        self.muted_role = Role.objects.create(conversation=self.conversation, name="Muted", can_send_messages=False)
        # FIXED: M2M Initialization
        user_member = ConversationMember.objects.create(conversation=self.conversation, user=self.user)
        user_member.roles.add(self.normal_role)

        muted_member = ConversationMember.objects.create(conversation=self.conversation, user=self.muted_user)
        muted_member.roles.add(self.muted_role)

        self.send_url = reverse('conversation-messages', kwargs={'conversation_pk': self.conversation.id})

    def test_user_can_send_message_to_topic(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(self.send_url, {
            'content': 'Hello Topic',
            'topic_id': str(self.topic.id)
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_muted_user_cannot_send_message(self):
        self.client.force_authenticate(user=self.muted_user)
        response = self.client.post(self.send_url, {'content': 'I am muted'})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)