from rest_framework import status
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
import uuid

from chat.models import Conversation, ConversationMember

User = get_user_model()

class GroupRemoveMemberTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username='owner', email='owner@test.com',
            password='pass', display_name='Owner'
        )
        self.member = User.objects.create_user(
            username='member', email='member@test.com',
            password='pass', display_name='Member'
        )
        self.other_member = User.objects.create_user(
            username='other_member', email='other@test.com',
            password='pass', display_name='Other'
        )
        self.group = Conversation.objects.create(
            type=Conversation.Type.GROUP,
            name='Test Group',
            owner=self.owner
        )
        ConversationMember.objects.create(conversation=self.group, user=self.owner)
        ConversationMember.objects.create(conversation=self.group, user=self.member)
        ConversationMember.objects.create(conversation=self.group, user=self.other_member)

        self.remove_url = reverse('conversation-remove-member', kwargs={'pk': self.group.id})

    def test_owner_can_remove_member(self):
        self.client.force_authenticate(user=self.owner)
        data = {'user_id': str(self.member.id)}
        response = self.client.post(self.remove_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(
            ConversationMember.objects.filter(
                conversation=self.group, user=self.member
            ).exists()
        )

    def test_non_owner_cannot_remove(self):
        self.client.force_authenticate(user=self.member)
        data = {'user_id': str(self.other_member.id)}
        response = self.client.post(self.remove_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('only the group owner', response.data['detail'].lower())

    def test_owner_cannot_remove_nonexistent_user(self):
        self.client.force_authenticate(user=self.owner)
        fake_user_id = uuid.uuid4()  # random
        data = {'user_id': str(fake_user_id)}
        response = self.client.post(self.remove_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_owner_cannot_remove_themselves(self):
        self.client.force_authenticate(user=self.owner)
        data = {'user_id': str(self.owner.id)}
        response = self.client.post(self.remove_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('cannot remove yourself', response.data['detail'].lower())

    def test_missing_user_id_returns_400(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(self.remove_url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('user_id', response.data['detail'].lower())

    def test_removed_user_cannot_access_conversation(self):
        self.client.force_authenticate(user=self.owner)
        data = {'user_id': str(self.member.id)}
        self.client.post(self.remove_url, data, format='json')

        # Verify the removed user no longer sees the conversation in their list
        self.client.force_authenticate(user=self.member)
        list_url = reverse('conversation-overview')
        response = self.client.get(list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # conversation should not be in the list
        self.assertFalse(
            any(conv['id'] == str(self.group.id) for conv in response.data)
        )