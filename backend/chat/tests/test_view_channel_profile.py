from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from .models import Conversation, Channel, ConversationMember, Role

User = get_user_model()

class ChannelMembersListVisibilityTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='owner_user', email='owner@example.com', password='pass')
        self.moderator = User.objects.create_user(username='mod_user', email='mod@example.com', password='pass')
        self.normal_user = User.objects.create_user(username='normal_user', email='normal@example.com', password='pass')

        self.conversation = Conversation.objects.create(
            type=Conversation.Type.CHANNEL,
            name="Test Channel",
            owner=self.owner
        )
        self.channel = Channel.objects.create(conversation=self.conversation, is_private=False)

        self.mod_role = Role.objects.create(
            conversation=self.conversation, name="Moderator", can_manage_members=True
        )
        self.normal_role = Role.objects.create(
            conversation=self.conversation, name="Member", can_manage_members=False
        )

        ConversationMember.objects.create(conversation=self.conversation, user=self.owner)
        ConversationMember.objects.create(conversation=self.conversation, user=self.moderator, role=self.mod_role)
        ConversationMember.objects.create(conversation=self.conversation, user=self.normal_user, role=self.normal_role)

        self.url = reverse('channel-members-list', kwargs={'conversation_id': self.conversation.id})

    def test_owner_can_view_members(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)

    def test_moderator_can_view_members(self):
        self.client.force_authenticate(user=self.moderator)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)

    def test_normal_user_cannot_view_members(self):
        self.client.force_authenticate(user=self.normal_user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)