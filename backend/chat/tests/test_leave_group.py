from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from users.models import User
from chat.models import Conversation, ConversationMember

class GroupLeaveTests(TestCase):
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
        self.group = Conversation.objects.create(
            type=Conversation.Type.GROUP,
            name='Test Group',
            owner=self.owner
        )
        ConversationMember.objects.create(conversation=self.group, user=self.owner)
        ConversationMember.objects.create(conversation=self.group, user=self.member)
        self.leave_url = reverse('conversation-leave', kwargs={'pk': self.group.id})

    def test_leave_group_success(self):
        self.client.force_authenticate(user=self.member)
        response = self.client.post(self.leave_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        # Verify membership removed
        self.assertFalse(
            ConversationMember.objects.filter(
                conversation=self.group, user=self.member
            ).exists()
        )

    def test_leave_requires_membership(self):
        outsider = User.objects.create_user(
            username='outsider', email='out@test.com',
            password='pass', display_name='Outsider'
        )
        self.client.force_authenticate(user=outsider)
        response = self.client.post(self.leave_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)  # because get_object filters by membership

    def test_cannot_leave_dm(self):
        # Create a DM conversation (not a group)
        dm = Conversation.objects.create(type=Conversation.Type.DM)
        ConversationMember.objects.create(conversation=dm, user=self.owner)
        ConversationMember.objects.create(conversation=dm, user=self.member)
        leave_dm_url = reverse('conversation-leave', kwargs={'pk': dm.id})
        self.client.force_authenticate(user=self.member)
        response = self.client.post(leave_dm_url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("only leave group", response.data['detail'].lower())

    def test_owner_cannot_leave(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(self.leave_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("owner cannot leave", response.data['detail'].lower())
        # Confirm membership still exists
        self.assertTrue(
            ConversationMember.objects.filter(
                conversation=self.group, user=self.owner
            ).exists()
        )
