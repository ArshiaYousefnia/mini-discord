from unittest import TestCase

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model

from chat.models import Conversation, ConversationMember, Role, Channel, Message, ChannelMessage, Topic

User = get_user_model()

class ChannelMessageTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(username='owner', email='o@t.com', password='pass', display_name='Owner')
        self.muted = User.objects.create_user(username='muted', email='m@t.com', password='pass', display_name='Muted')
        self.channel = Conversation.objects.create(type=Conversation.Type.CHANNEL, name='Test', owner=self.owner)
        Channel.objects.create(conversation=self.channel, is_private=True)
        self.owner_role = Role.objects.create(conversation=self.channel, name='Owner', can_send_messages=True)
        self.muted_role = Role.objects.create(conversation=self.channel, name='Muted', can_send_messages=False)
        ConversationMember.objects.create(conversation=self.channel, user=self.owner, role=self.owner_role)
        ConversationMember.objects.create(conversation=self.channel, user=self.muted, role=self.muted_role)
        self.send_url = reverse('conversation-messages', kwargs={'conversation_pk': self.channel.id})

    def test_owner_can_send_message(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(self.send_url, {'content': 'Hello'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # It should be a ChannelMessage with no topic
        msg = Message.objects.get(id=response.data['id'])
        self.assertIsInstance(msg, ChannelMessage)
        self.assertIsNone(msg.topic)
        self.assertNotIn('topic_id', response.data)  # ChannelMessageSerializer returns topic_id=None? Actually it would be null
        # But better to check it's present as null
        self.assertIsNone(response.data.get('topic_id'))

    def test_muted_member_cannot_send(self):
        self.client.force_authenticate(user=self.muted)
        response = self.client.post(self.send_url, {'content': 'Hi'})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_send_message_with_topic(self):
        self.client.force_authenticate(user=self.owner)
        topic = Topic.objects.create(conversation=self.channel, name='General', creator=self.owner)
        response = self.client.post(self.send_url, {'content': 'Topic message', 'topic_id': str(topic.id)})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['topic_id'], str(topic.id))
        self.assertEqual(response.data['topic_name'], 'General')

    def test_list_messages_includes_topic(self):
        topic = Topic.objects.create(conversation=self.channel, name='Talk', creator=self.owner)
        ChannelMessage.objects.create(conversation=self.channel, sender=self.owner, content='First', topic=topic)
        ChannelMessage.objects.create(conversation=self.channel, sender=self.owner, content='Second', topic=None)
        self.client.force_authenticate(user=self.owner)
        list_url = reverse('conversation-messages', kwargs={'conversation_pk': self.channel.id})
        response = self.client.get(list_url)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(response.data[0]['topic_id'], str(topic.id))
        self.assertEqual(response.data[1]['topic_id'], None)
