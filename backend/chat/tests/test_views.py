from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from chat.models import Conversation, ConversationMember, Message

User = get_user_model()


class DirectMessageAPITests(APITestCase):
    def setUp(self):
        # Create two users
        self.alice = User.objects.create_user(
            username="alice",
            email="alice@test.com",
            password="testpass123"
        )
        self.bob = User.objects.create_user(
            username="bob",
            email="bob@test.com",
            password="testpass123"
        )
        # URL for sending DM
        self.dm_url = reverse('direct-message-list')  # DRF router generates name "direct-message-list"

    def _authenticate(self, user):
        """Helper to force login."""
        self.client.force_authenticate(user=user)

    def test_send_first_dm_creates_conversation_and_message(self):
        self._authenticate(self.alice)
        data = {
            "recipient_id": str(self.bob.id),
            "content": "Hey Bob!"
        }
        response = self.client.post(self.dm_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Conversation created
        self.assertEqual(Conversation.objects.count(), 1)
        conv = Conversation.objects.first()
        self.assertEqual(conv.type, Conversation.Type.DM)

        # Both users are members
        members = ConversationMember.objects.filter(conversation=conv)
        self.assertEqual(members.count(), 2)
        self.assertTrue(members.filter(user=self.alice).exists())
        self.assertTrue(members.filter(user=self.bob).exists())

        # Message created
        self.assertEqual(Message.objects.count(), 1)
        msg = Message.objects.first()
        self.assertEqual(msg.content, "Hey Bob!")
        self.assertEqual(msg.sender, self.alice)
        self.assertIsNotNone(msg.created_at)

        # Response contains expected fields
        self.assertIn('id', response.data)
        self.assertIn('sender_username', response.data)
        self.assertIn('created_at', response.data)

    def test_send_second_dm_reuses_existing_conversation(self):
        self._authenticate(self.alice)
        # First message
        self.client.post(self.dm_url, {
            "recipient_id": str(self.bob.id),
            "content": "First"
        }, format='json')
        # Second message
        response = self.client.post(self.dm_url, {
            "recipient_id": str(self.bob.id),
            "content": "Second"
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Conversation.objects.count(), 1)  # still only one conversation
        self.assertEqual(Message.objects.count(), 2)

    def test_send_empty_content_fails(self):
        self._authenticate(self.alice)
        data = {"recipient_id": str(self.bob.id), "content": ""}
        response = self.client.post(self.dm_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("content", response.data)

    def test_send_whitespace_only_content_fails(self):
        self._authenticate(self.alice)
        data = {"recipient_id": str(self.bob.id), "content": "   "}
        response = self.client.post(self.dm_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_send_exceeding_max_length_fails(self):
        self._authenticate(self.alice)
        data = {
            "recipient_id": str(self.bob.id),
            "content": "x" * 2001
        }
        response = self.client.post(self.dm_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_send_to_self_fails(self):
        self._authenticate(self.alice)
        data = {"recipient_id": str(self.alice.id), "content": "Hello me"}
        response = self.client.post(self.dm_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_send_without_recipient_fails(self):
        self._authenticate(self.alice)
        data = {"content": "Missing recipient"}
        response = self.client.post(self.dm_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("recipient_id", response.data)

    def test_unauthenticated_request_fails(self):
        data = {"recipient_id": str(self.bob.id), "content": "Hi"}
        response = self.client.post(self.dm_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_message_timestamp_is_returned(self):
        self._authenticate(self.alice)
        data = {"recipient_id": str(self.bob.id), "content": "Time test"}
        response = self.client.post(self.dm_url, data, format='json')
        self.assertIn('created_at', response.data)
        # Check it is a valid ISO string
        from datetime import datetime
        try:
            datetime.fromisoformat(response.data['created_at'].replace('Z', '+00:00'))
        except ValueError:
            self.fail("created_at is not valid ISO format")