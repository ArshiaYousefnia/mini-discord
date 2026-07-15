from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from chat.models import Conversation, Channel, ConversationMember, Role

User = get_user_model()

class ChannelUpdateTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username='owner_user', email='owner@example.com', password='testpassword123'
        )
        self.admin_user = User.objects.create_user(
            username='admin_user', email='admin@example.com', password='testpassword123'
        )
        self.normal_user = User.objects.create_user(
            username='normal_user', email='normal@example.com', password='testpassword123'
        )

        # ساخت کانال
        self.conversation = Conversation.objects.create(
            type=Conversation.Type.CHANNEL,
            name="Original Name",
            description="Original Description",
            owner=self.owner
        )
        self.channel = Channel.objects.create(
            conversation=self.conversation,
            is_private=False
        )

        self.admin_role = Role.objects.create(
            conversation=self.conversation,
            name="Admin",
            can_manage_roles=True
        )
        self.normal_role = Role.objects.create(
            conversation=self.conversation,
            name="Member",
            can_manage_roles=False
        )

        ConversationMember.objects.create(conversation=self.conversation, user=self.owner, role=self.admin_role)
        ConversationMember.objects.create(conversation=self.conversation, user=self.admin_user, role=self.admin_role)
        ConversationMember.objects.create(conversation=self.conversation, user=self.normal_user, role=self.normal_role)

        self.update_url = reverse('channel-update', kwargs={'conversation_id': self.conversation.id})

    def test_update_channel_by_owner_success(self):
        self.client.force_authenticate(user=self.owner)
        data = {
            "name": "Updated By Owner",
            "description": "New description here"
        }
        response = self.client.patch(self.update_url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.conversation.refresh_from_db()
        self.assertEqual(self.conversation.name, "Updated By Owner")
        self.assertEqual(self.conversation.description, "New description here")

    def test_update_channel_by_admin_success(self):
        self.client.force_authenticate(user=self.admin_user)
        data = {"name": "Updated By Admin"}
        response = self.client.patch(self.update_url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.conversation.refresh_from_db()
        self.assertEqual(self.conversation.name, "Updated By Admin")

    def test_update_channel_by_normal_member_forbidden(self):
        self.client.force_authenticate(user=self.normal_user)
        data = {"name": "Hacked Name"}
        response = self.client.patch(self.update_url, data)
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['detail'], "You do not have permission to edit this channel's info.")

    def test_update_channel_by_non_member_forbidden(self):
        outsider = User.objects.create_user(
            username='outsider', email='outsider@example.com', password='testpassword123'
        )
        self.client.force_authenticate(user=outsider)
        data = {"name": "Hacked Name"}
        response = self.client.patch(self.update_url, data)
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['detail'], "You are not a member of this channel.")