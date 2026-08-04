import uuid
from unittest import mock
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from chat.models import Conversation, ConversationMember, Message, Notification, Role
from chat.serializers import NotificationSerializer

User = get_user_model()

def mock_broadcast_notification(user_id, data):
    pass

class NotificationTests(TestCase):
    def setUp(self):
        self.user1 = User.objects.create_user(
            username='alice',
            email='alice@example.com',
            password='pass'
        )
        self.user2 = User.objects.create_user(
            username='bob',
            email='bob@example.com',
            password='pass'
        )
        self.user3 = User.objects.create_user(
            username='charlie',
            email='charlie@example.com',
            password='pass'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user1)

    @mock.patch('chat.views.broadcast_notification')
    def test_dm_creates_notification_for_recipient(self, mock_broadcast):
        url = '/api/chat/dm/'
        data = {
            'recipient_id': str(self.user2.id),
            'content': 'Secret message'
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 201)
        notif = Notification.objects.filter(recipient=self.user2, type=Notification.Type.DM).first()
        self.assertIsNotNone(notif)
        self.assertEqual(notif.message_preview, 'Secret message')
        mock_broadcast.assert_called_once_with(self.user2.id, NotificationSerializer(notif).data)

    def test_reply_creates_notification_via_signal(self):
        conv = Conversation.objects.create(type=Conversation.Type.GROUP, owner=self.user1)
        ConversationMember.objects.create(conversation=conv, user=self.user1)
        ConversationMember.objects.create(conversation=conv, user=self.user2)
        msg1 = Message.objects.create(conversation=conv, sender=self.user1, content='Original')
        self.client.force_authenticate(user=self.user2)
        url = f'/api/chat/conversations/{conv.id}/messages/'
        data = {
            'content': 'Reply',
            'reply_to': str(msg1.id)
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 201)
        notif = Notification.objects.filter(recipient=self.user1, type=Notification.Type.REPLY).first()
        self.assertIsNotNone(notif)
        self.assertEqual(notif.message_preview, 'Reply')
        self.assertEqual(notif.sender, self.user2)

    def test_notification_api_endpoints(self):
        notif1 = Notification.objects.create(
            recipient=self.user1,
            sender=self.user2,
            type=Notification.Type.DM,
            message_preview='Hi',
            is_read=False
        )
        notif2 = Notification.objects.create(
            recipient=self.user1,
            sender=self.user2,
            type=Notification.Type.DM,
            message_preview='Hi again',
            is_read=False
        )
        self.client.force_authenticate(user=self.user1)
        response = self.client.get('/api/chat/notifications/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)

        response = self.client.patch(f'/api/chat/notifications/{notif1.id}/read/')
        self.assertEqual(response.status_code, 200)
        notif1.refresh_from_db()
        self.assertTrue(notif1.is_read)

        response = self.client.get('/api/chat/notifications/unread-count/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['unread_count'], 1)
