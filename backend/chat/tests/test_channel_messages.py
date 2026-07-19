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

User = get_user_model()

class ChannelMessageTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tag = str(uuid.uuid4())[:8]

    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username=f'owner-{self.tag}',
            email=f'owner-{self.tag}@test.com',
            password='pass',
            display_name='Owner'
        )
        self.muted = User.objects.create_user(
            username=f'muted-{self.tag}',
            email=f'muted-{self.tag}@test.com',
            password='pass',
            display_name='Muted'
        )
        self.channel = Conversation.objects.create(
            type=Conversation.Type.CHANNEL, name='Test', owner=self.owner
        )
        Channel.objects.create(conversation=self.channel, is_private=True)
        self.owner_role = Role.objects.create(
            conversation=self.channel, name='Owner', can_send_messages=True
        )
        self.muted_role = Role.objects.create(
            conversation=self.channel, name='Muted', can_send_messages=False
        )
        ConversationMember.objects.create(
            conversation=self.channel, user=self.owner, role=self.owner_role
        )
        ConversationMember.objects.create(
            conversation=self.channel, user=self.muted, role=self.muted_role
        )
        self.send_url = reverse(
            'conversation-messages',
            kwargs={'conversation_pk': self.channel.id}
        )

    def test_owner_can_send_message(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(self.send_url, {'content': 'Hello'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # The response must include topic_id (even if null)
        self.assertIn('topic_id', response.data)
        self.assertIsNone(response.data['topic_id'])

        # Verify a ChannelMessage record exists for this message
        msg = Message.objects.get(id=response.data['id'])
        self.assertTrue(hasattr(msg, 'channelmessage'), "Should be a ChannelMessage")
        self.assertIsNone(msg.channelmessage.topic)

    def test_list_messages_includes_topic(self):
        topic = Topic.objects.create(conversation=self.channel, name='Talk', creator=self.owner)
        ChannelMessage.objects.create(conversation=self.channel, sender=self.owner, content='First', topic=topic)
        ChannelMessage.objects.create(conversation=self.channel, sender=self.owner, content='Second', topic=None)
        self.client.force_authenticate(user=self.owner)
        list_url = reverse('conversation-messages', kwargs={'conversation_pk': self.channel.id})
        response = self.client.get(list_url)
        self.assertEqual(len(response.data), 2)
        # Messages are ordered by created_at ascending
        self.assertEqual(response.data[0]['topic_id'], str(topic.id))
        self.assertIsNone(response.data[1]['topic_id'])

    def test_muted_member_cannot_send(self):
        self.client.force_authenticate(user=self.muted)
        response = self.client.post(self.send_url, {'content': 'Hi'})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_send_message_with_topic(self):
        self.client.force_authenticate(user=self.owner)
        topic = Topic.objects.create(
            conversation=self.channel, name='General', creator=self.owner
        )
        response = self.client.post(
            self.send_url,
            {'content': 'Topic message', 'topic_id': str(topic.id)}
        )
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
        self.assertIsNone(response.data[1]['topic_id'])

    def test_edit_own_message(self):
        """User can edit their own message; is_edited becomes True."""
        self.client.force_authenticate(user=self.owner)
        # First, send a message
        resp = self.client.post(self.send_url, {'content': 'Original'})
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        msg_id = resp.data['id']
        detail_url = reverse('conversation-message-detail', kwargs={
            'conversation_pk': self.channel.id,
            'pk': msg_id,
        })
        # Edit it
        patch_resp = self.client.patch(detail_url, {'content': 'Edited'}, format='json')
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_resp.data['content'], 'Edited')
        self.assertTrue(patch_resp.data['is_edited'])

        # Verify in database
        msg = Message.objects.get(id=msg_id)
        self.assertEqual(msg.content, 'Edited')
        self.assertTrue(msg.is_edited)

    def test_delete_own_message(self):
        """User can delete their own message (soft delete)."""
        self.client.force_authenticate(user=self.owner)
        resp = self.client.post(self.send_url, {'content': 'To be deleted'})
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        msg_id = resp.data['id']
        detail_url = reverse('conversation-message-detail', kwargs={
            'conversation_pk': self.channel.id,
            'pk': msg_id,
        })
        delete_resp = self.client.delete(detail_url)
        self.assertEqual(delete_resp.status_code, status.HTTP_204_NO_CONTENT)

        msg = Message.objects.get(id=msg_id)
        self.assertTrue(msg.is_deleted)
        self.assertEqual(msg.content, '')

    def test_send_empty_content_rejected(self):
        """Sending empty or whitespace-only content returns 400."""
        self.client.force_authenticate(user=self.owner)
        for content in ['', '   ']:
            resp = self.client.post(self.send_url, {'content': content})
            self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn('content', resp.data)

    def test_send_with_nonexistent_topic(self):
        """Sending with a non-existent topic_id returns 404."""
        self.client.force_authenticate(user=self.owner)
        fake_topic_id = uuid.uuid4()
        resp = self.client.post(self.send_url, {
            'content': 'msg',
            'topic_id': str(fake_topic_id),
        })
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)