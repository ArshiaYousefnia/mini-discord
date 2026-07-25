from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from chat.models import Conversation, Channel, ConversationMember

User = get_user_model()
class ChannelLeaveTests(APITestCase):

    def setUp(self):
        self.owner = User.objects.create_user(username='channel_owner', email='owner@test.com', password='password123')
        self.member = User.objects.create_user(username='normal_member', email='member@test.com', password='password123')
        self.non_member = User.objects.create_user(username='outsider', email='outsider@test.com', password='password123')

        self.conversation = Conversation.objects.create(
            type=Conversation.Type.CHANNEL,
            name='Test Channel',
            owner=self.owner
        )
        self.channel = Channel.objects.create(
            conversation=self.conversation,
            is_private=False
        )

        ConversationMember.objects.create(
            conversation=self.conversation,
            user=self.owner
        )
        self.membership = ConversationMember.objects.create(
            conversation=self.conversation,
            user=self.member
        )

        self.leave_url = reverse('conversation-leave', kwargs={'pk': self.conversation.id})

    def test_member_can_leave_channel_successfully(self):
        self.client.force_authenticate(user=self.member)
        response = self.client.post(self.leave_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        is_member = ConversationMember.objects.filter(
            conversation=self.conversation,
            user=self.member
        ).exists()
        self.assertFalse(is_member)

    def test_owner_cannot_leave_channel(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(self.leave_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            response.data['detail'], 
            "The owner cannot leave. Transfer ownership first or delete the conversation."
        )
        
        is_member = ConversationMember.objects.filter(
            conversation=self.conversation,
            user=self.owner
        ).exists()
        self.assertTrue(is_member)

    def test_non_member_cannot_leave_channel(self):
        self.client.force_authenticate(user=self.non_member)
        response = self.client.post(self.leave_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unauthenticated_user_cannot_leave(self):
        response = self.client.post(self.leave_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)