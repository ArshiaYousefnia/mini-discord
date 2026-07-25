from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from users.models import User
from chat.models import Conversation, ConversationMember

class ChannelCreateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='creator',
            email='creator@test.com',
            password='testpass123',
            display_name='Creator',
        )
        self.client.force_authenticate(user=self.user)
        self.url = reverse('channel-create')

    def test_create_private_channel_success(self):
        data = {
            'name': 'My Private Channel',
            'description': 'Secret stuff',
            'is_private': True,
        }
        response = self.client.post(self.url, data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'My Private Channel')
        self.assertTrue(response.data['is_private'])
        self.assertIsNotNone(response.data['invite_link'])

        # Verify Conversation and Channel objects
        conv = Conversation.objects.get(id=response.data['id'])
        self.assertEqual(conv.type, Conversation.Type.CHANNEL)
        self.assertEqual(conv.owner, self.user)
        self.assertTrue(hasattr(conv, 'channel'))
        self.assertTrue(conv.channel.is_private)
        self.assertIsNone(conv.channel.public_id)

        # Verify role and membership
        role = conv.roles.get(name='Channel Owner')
        self.assertTrue(role.can_manage_members)
        member = ConversationMember.objects.get(conversation=conv, user=self.user)
        self.assertEqual(member.roles.first(), role)

    def test_create_public_channel_with_public_id(self):
        data = {
            'name': 'Public Channel',
            'is_private': False,
            'public_id': 'my-unique-id',
        }
        response = self.client.post(self.url, data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data['is_private'])
        self.assertEqual(response.data['public_id'], 'my-unique-id')
        conv = Conversation.objects.get(id=response.data['id'])
        self.assertEqual(conv.channel.public_id, 'my-unique-id')

    def test_public_channel_requires_public_id(self):
        response = self.client.post(self.url, {'name': 'Oops', 'is_private': False}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('public_id', response.data)

    def test_public_id_must_be_unique(self):
        # Create first public channel
        self.client.post(self.url, {
            'name': 'First', 'is_private': False, 'public_id': 'duplicate'
        })
        # Attempt duplicate
        response = self.client.post(self.url, {
            'name': 'Second', 'is_private': False, 'public_id': 'duplicate'
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('public_id', response.data)

    def test_empty_name_rejected(self):
        response = self.client.post(self.url, {'name': '   '}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data)

    def test_invite_link_generated(self):
        response = self.client.post(self.url, {'name': 'Link test', 'is_private': True})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('/api/chat/invite/', response.data['invite_link'])

    def test_unauthenticated_denied(self):
        self.client.logout()
        response = self.client.post(self.url, {'name': 'x'})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)