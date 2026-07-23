import uuid
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from chat.models import Conversation, Channel, Role, ConversationMember

User = get_user_model()
class ChannelDeletionTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='owner', email='owner@test.com', password='password')
        self.member = User.objects.create_user(username='member', email='member@test.com', password='password')
        self.conversation = Conversation.objects.create(name="Test Channel", is_channel=True)
        
        self.owner_role = Role.objects.create(name="Owner", can_delete_channel=True)
        self.member_role = Role.objects.create(name="Member", can_delete_channel=False)

        # FIXED: M2M Initialization
        owner_member = ConversationMember.objects.create(conversation=self.conversation, user=self.owner)
        owner_member.roles.add(self.owner_role)

        member_obj = ConversationMember.objects.create(conversation=self.conversation, user=self.member)
        member_obj.roles.add(self.member_role)

        self.url = f'/api/channels/{self.conversation.id}/'

    def test_member_cannot_delete_channel(self):
        self.client.force_authenticate(user=self.member)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Conversation.objects.filter(id=self.conversation.id).exists())

    def test_owner_can_delete_channel(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Conversation.objects.filter(id=self.conversation.id).exists())

    def test_owner_cannot_leave_without_transferring(self):
        self.client.force_authenticate(user=self.owner)
        leave_url = f'/api/channels/{self.conversation.id}/leave/'
        response = self.client.post(leave_url)
        
        # Expecting failure because they are the sole owner
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)