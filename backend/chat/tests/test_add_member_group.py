from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
import uuid

from chat.models import Conversation, ConversationMember

User = get_user_model()

class GroupJoinInviteTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username='owner', email='owner@test.com', password='password123', display_name='Group Owner'
        )
        self.non_member = User.objects.create_user(
            username='newbie', email='newbie@test.com', password='password123', display_name='New User'
        )
        self.existing_member = User.objects.create_user(
            username='member', email='member@test.com', password='password123', display_name='Existing Member'
        )

        self.group = Conversation.objects.create(
            type=Conversation.Type.GROUP,
            name="گروه تستی برنامه نویسان",
            owner=self.owner
        )

        ConversationMember.objects.create(conversation=self.group, user=self.owner)
        ConversationMember.objects.create(conversation=self.group, user=self.existing_member)

        self.join_url = f'/api/chat/conversations/groups/join/{self.group.invite_token}/'

    def test_group_detail_contains_invite_token(self):
        self.assertTrue(hasattr(self.group, 'invite_token'))
        self.assertIsNotNone(self.group.invite_token)

    def test_join_group_via_valid_link_success(self):
        self.client.force_authenticate(user=self.non_member)
        
        response = self.client.post(self.join_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], str(self.group.id))
        
        is_member = ConversationMember.objects.filter(conversation=self.group, user=self.non_member).exists()
        self.assertTrue(is_member)

        member_ship = ConversationMember.objects.get(conversation=self.group, user=self.non_member)
        self.assertEqual(member_ship.role.name, 'Member')
        self.assertTrue(member_ship.role.can_send_messages)

    def test_join_group_via_invalid_link_fails(self):
        self.client.force_authenticate(user=self.non_member)
        
        fake_token = uuid.uuid4()
        invalid_url = f'/api/chat/conversations/groups/join/{fake_token}/'
        
        response = self.client.post(invalid_url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("invalid", response.data['detail'].lower())

    def test_join_group_already_a_member_fails(self):

        self.client.force_authenticate(user=self.existing_member)
        
        response = self.client.post(self.join_url)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already a member", response.data['detail'].lower())