from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from chat.models import Conversation, Channel, ConversationMember

User = get_user_model()

class ChannelPublicIdTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username='admin_user',
            email='admin@example.com',
            password='testpassword123'
        )
        
        self.searcher_user = User.objects.create_user(
            username='searcher_user',
            email='searcher@example.com',
            password='testpassword123'
        )

        self.conversation = Conversation.objects.create(
            type=Conversation.Type.CHANNEL,
            name="Django Devs",
            description="Public channel for Django developers",
            owner=self.owner
        )
        self.channel = Channel.objects.create(
            conversation=self.conversation,
            is_private=False,
            public_id="django_devs_official"
        )

        ConversationMember.objects.create(
            conversation=self.conversation,
            user=self.owner
        )

        self.valid_url = reverse('channel-public-join', kwargs={'public_id': 'django_devs_official'})
        self.invalid_url = reverse('channel-public-join', kwargs={'public_id': 'wrong_id_404'})

    def test_search_channel_by_public_id_success(self):
        self.client.force_authenticate(user=self.searcher_user)
        response = self.client.get(self.valid_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], "Django Devs")
        self.assertEqual(response.data['public_id'], "django_devs_official")

    def test_search_channel_not_found(self):
        self.client.force_authenticate(user=self.searcher_user)
        response = self.client.get(self.invalid_url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data['detail'], "Channel not found.")

    def test_join_channel_by_public_id_success(self):
        self.client.force_authenticate(user=self.searcher_user)
        response = self.client.post(self.valid_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        is_member = ConversationMember.objects.filter(
            conversation=self.conversation,
            user=self.searcher_user
        ).exists()
        self.assertTrue(is_member)

    def test_join_public_channel_already_member(self):
        ConversationMember.objects.create(
            conversation=self.conversation,
            user=self.searcher_user
        )

        self.client.force_authenticate(user=self.searcher_user)
        response = self.client.post(self.valid_url)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], "You are already a member of this channel.")