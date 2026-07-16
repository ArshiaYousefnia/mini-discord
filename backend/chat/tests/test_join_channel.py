from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

from chat.models import Conversation, Channel, ConversationMember


User = get_user_model()

class ChannelJoinTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username='owner_user',
            email='owner@example.com',
            password='testpassword123'
        )
        
        self.joining_user = User.objects.create_user(
            username='joining_user',
            email='joiner@example.com',
            password='testpassword123'
        )

        self.conversation = Conversation.objects.create(
            type=Conversation.Type.CHANNEL,
            name="Test Channel",
            description="A channel for testing",
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

        self.join_url = reverse('channel-join', kwargs={'invite_code': self.channel.invite_code})

    def test_get_channel_preview_success(self):
        self.client.force_authenticate(user=self.joining_user)
        response = self.client.get(self.join_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], "Test Channel")
        self.assertEqual(response.data['description'], "A channel for testing")

    def test_join_channel_success(self):
        self.client.force_authenticate(user=self.joining_user)
        response = self.client.post(self.join_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        is_member = ConversationMember.objects.filter(
            conversation=self.conversation,
            user=self.joining_user
        ).exists()
        self.assertTrue(is_member)

    def test_join_channel_already_member(self):

        ConversationMember.objects.create(
            conversation=self.conversation,
            user=self.joining_user
        )

        self.client.force_authenticate(user=self.joining_user)
        response = self.client.post(self.join_url)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], "You are already a member of this channel.")

    def test_join_channel_invalid_link(self):
        import uuid
        invalid_url = reverse('channel-join', kwargs={'invite_code': uuid.uuid4()})
        
        self.client.force_authenticate(user=self.joining_user)
        
        response_get = self.client.get(invalid_url)
        self.assertEqual(response_get.status_code, status.HTTP_404_NOT_FOUND)
        
        response_post = self.client.post(invalid_url)
        self.assertEqual(response_post.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response_post.data['detail'], "Invalid link.")