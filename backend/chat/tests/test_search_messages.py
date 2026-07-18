from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from users.models import User
from chat.models import Conversation, ConversationMember, Message

class MessageSearchTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='tester', email='t@t.com',
            password='pass', display_name='Tester'
        )
        self.other = User.objects.create_user(
            username='other', email='o@o.com',
            password='pass', display_name='Other'
        )
        self.group = Conversation.objects.create(
            type=Conversation.Type.GROUP, name='Test', owner=self.user
        )
        ConversationMember.objects.create(conversation=self.group, user=self.user)
        ConversationMember.objects.create(conversation=self.group, user=self.other)

        # Create some messages
        Message.objects.create(
            conversation=self.group, sender=self.user,
            content='Hello everyone, welcome to the group!'
        )
        Message.objects.create(
            conversation=self.group, sender=self.other,
            content='Thanks! Excited to be here.'
        )
        Message.objects.create(
            conversation=self.group, sender=self.user,
            content='Let\'s plan our first event.'
        )

        self.search_url = reverse('conversation-messages-search',
                                  kwargs={'conversation_pk': self.group.id})

    def test_search_finds_matching_message(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.search_url, {'q': 'excited'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertIn('excited', response.data[0]['content'].lower())

    def test_search_case_insensitive(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.search_url, {'q': 'HELLO'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)  # only the first message

    def test_search_requires_min_length(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.search_url, {'q': 'ab'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(self.search_url, {'q': 'abc'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_search_no_results(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.search_url, {'q': 'banana'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

    def test_search_must_be_member(self):
        outsider = User.objects.create_user(
            username='outsider', email='out@test.com',
            password='pass', display_name='Outsider'
        )
        self.client.force_authenticate(user=outsider)
        response = self.client.get(self.search_url, {'q': 'hello'})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)  # get_object_or_404