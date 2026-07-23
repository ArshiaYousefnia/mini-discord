import uuid
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from chat.models import Conversation, Channel, Role, ConversationMember

User = get_user_model()
class ChannelRoleAssignmentTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='channel_owner', password='password')
        self.admin = User.objects.create_user(username='channel_admin', password='password')
        self.normal_member = User.objects.create_user(username='normal_member', password='password')

        self.conversation = Conversation.objects.create(name="Test Channel", is_channel=True)
        
        self.admin_role = Role.objects.create(name="Admin", can_manage_roles=True)
        self.basic_role = Role.objects.create(name="Basic", can_manage_roles=False)
        self.new_custom_role = Role.objects.create(name="CustomRole", can_manage_roles=False)

        # FIXED: M2M Initialization
        owner_member = ConversationMember.objects.create(conversation=self.conversation, user=self.owner)
        owner_member.roles.add(self.admin_role)

        admin_member = ConversationMember.objects.create(conversation=self.conversation, user=self.admin)
        admin_member.roles.add(self.admin_role)

        self.target_membership = ConversationMember.objects.create(conversation=self.conversation, user=self.normal_member)
        self.target_membership.roles.add(self.basic_role)

        self.url = f'/api/channels/{self.conversation.id}/members/{self.target_membership.id}/role/'

    def test_owner_can_assign_role(self):
        self.client.force_authenticate(user=self.owner)
        data = {'role_id': str(self.new_custom_role.id)}
        response = self.client.patch(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.target_membership.refresh_from_db()
        # FIXED: Querying the M2M manager instead of an attribute
        self.assertEqual(self.target_membership.roles.first(), self.new_custom_role)

    def test_normal_member_cannot_assign_roles(self):
        self.client.force_authenticate(user=self.normal_member)
        data = {'role_id': str(self.new_custom_role.id)}
        response = self.client.patch(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)