from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from users.models import User
from chat.models import Conversation, Channel, ConversationMember, Role

class ChannelRolesTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username='owner', email='o@t.com',
            password='pass', display_name='Owner',
        )
        self.member = User.objects.create_user(
            username='member', email='m@t.com',
            password='pass', display_name='Member',
        )
        self.channel_conv = Conversation.objects.create(
            type=Conversation.Type.CHANNEL,
            name='Test Channel',
            owner=self.owner,
        )
        self.channel = Channel.objects.create(
            conversation=self.channel_conv,
            is_private=True,
        )
        ConversationMember.objects.create(conversation=self.channel_conv, user=self.owner)
        ConversationMember.objects.create(conversation=self.channel_conv, user=self.member)
        self.url = reverse('channel-roles', kwargs={'conversation_id': self.channel_conv.id})

    def test_owner_can_create_role(self):
        self.client.force_authenticate(user=self.owner)
        data = {'name': 'Moderator'}
        response = self.client.post(self.url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Moderator')
        self.assertTrue(Role.objects.filter(conversation=self.channel_conv, name='Moderator').exists())

    def test_owner_can_list_roles(self):
        self.client.force_authenticate(user=self.owner)
        Role.objects.create(conversation=self.channel_conv, name='Admin')
        Role.objects.create(conversation=self.channel_conv, name='VIP')
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_non_owner_cannot_create_role(self):
        self.client.force_authenticate(user=self.member)
        response = self.client.post(self.url, {'name': 'Test'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_owner_cannot_list_roles(self):
        self.client.force_authenticate(user=self.member)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_role_empty_name(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(self.url, {'name': ''}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data)

    def test_create_role_whitespace_name(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(self.url, {'name': '   '}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_channel_conversation_returns_404(self):
        # Use a group conversation
        group = Conversation.objects.create(type=Conversation.Type.GROUP, name='Group', owner=self.owner)
        ConversationMember.objects.create(conversation=group, user=self.owner)
        url = reverse('channel-roles', kwargs={'conversation_id': group.id})
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)