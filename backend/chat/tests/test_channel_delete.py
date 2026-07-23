import uuid
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from chat.models import Conversation, Channel, Role, ConversationMember

User = get_user_model()
class ChannelDeletionTests(APITestCase):

    def setUp(self):
        self.owner = User.objects.create_user(username='owner', email='owner@test.com', password='password123')
        self.admin = User.objects.create_user(username='admin', email='admin@test.com', password='password123')
        self.normal_member = User.objects.create_user(username='member', email='member@test.com', password='password123')
        self.outside_user = User.objects.create_user(username='outsider', email='out@test.com', password='password123')

        self.conversation = Conversation.objects.create(
            type=Conversation.Type.CHANNEL,
            name='Target Channel',
            owner=self.owner
        )
        self.channel = Channel.objects.create(
            conversation=self.conversation,
            is_private=True
        )
        self.admin_role = Role.objects.create(
            conversation=self.conversation,
            name='Admin',
            can_manage_roles=True
        )

        self.basic_role = Role.objects.create(
            conversation=self.conversation,
            name='Basic Member',
        )

        ConversationMember.objects.create(
            conversation=self.conversation, user=self.owner
        )
        ConversationMember.objects.create(
            conversation=self.conversation, user=self.admin, role=self.admin_role
        )
        ConversationMember.objects.create(
            conversation=self.conversation, user=self.normal_member, role=self.basic_role
        )

        self.delete_url = reverse('channel-delete', kwargs={'conversation_id': self.conversation.id})

    def test_owner_can_delete_channel(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(self.delete_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        self.assertFalse(Conversation.objects.filter(id=self.conversation.id).exists())
        self.assertFalse(Channel.objects.filter(conversation_id=self.conversation.id).exists())

    def test_admin_with_permission_can_delete_channel(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(self.delete_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Conversation.objects.filter(id=self.conversation.id).exists())

    def test_member_without_permission_cannot_delete_channel(self):
        self.client.force_authenticate(user=self.normal_member)
        response = self.client.delete(self.delete_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Conversation.objects.filter(id=self.conversation.id).exists())

    def test_non_member_cannot_delete_channel(self):
        self.client.force_authenticate(user=self.outside_user)
        response = self.client.delete(self.delete_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_user_cannot_delete_channel(self):
        response = self.client.delete(self.delete_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)