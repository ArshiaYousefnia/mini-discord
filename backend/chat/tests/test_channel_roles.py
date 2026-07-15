import uuid
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from chat.models import Conversation, Channel, Role, ConversationMember

User = get_user_model()

class ChannelRoleAssignmentTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='owner', password='password123')
        self.admin = User.objects.create_user(username='admin', password='password123')
        self.normal_member = User.objects.create_user(username='normal_member', password='password123')
        self.outside_user = User.objects.create_user(username='outside_user', password='password123')

        self.conversation = Conversation.objects.create(
            type=Conversation.Type.CHANNEL,
            name='Test Channel',
            owner=self.owner
        )
        self.channel = Channel.objects.create(
            conversation=self.conversation,
            is_private=True
        )

        self.admin_role = Role.objects.create(
            conversation=self.conversation,
            name='Admin',
            can_manage_roles=True
        )
        self.basic_role = Role.objects.create(
            conversation=self.conversation,
            name='Basic Member',
            can_manage_roles=False
        )
        self.new_custom_role = Role.objects.create(
            conversation=self.conversation,
            name='Moderator',
            can_manage_roles=False,
            can_delete_messages=True
        )

        ConversationMember.objects.create(
            conversation=self.conversation, user=self.owner, role=self.admin_role
        )
        ConversationMember.objects.create(
            conversation=self.conversation, user=self.admin, role=self.admin_role
        )
        self.target_membership = ConversationMember.objects.create(
            conversation=self.conversation, user=self.normal_member, role=self.basic_role
        )

        self.url = reverse('channel-member-role-update', kwargs={
            'conversation_id': self.conversation.id,
            'user_id': self.normal_member.id
        })

    def test_owner_can_assign_role(self):
        self.client.force_authenticate(user=self.owner)
        data = {'role_id': str(self.new_custom_role.id)}
        
        response = self.client.patch(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.target_membership.refresh_from_db()
        self.assertEqual(self.target_membership.role, self.new_custom_role)

    def test_admin_with_permission_can_assign_role(self):
        self.client.force_authenticate(user=self.admin)
        data = {'role_id': str(self.new_custom_role.id)}
        
        response = self.client.patch(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_member_without_permission_cannot_assign_role(self):
        self.client.force_authenticate(user=self.normal_member)
        data = {'role_id': str(self.admin_role.id)}
        
        response = self.client.patch(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_assign_role_to_non_member(self):
        self.client.force_authenticate(user=self.owner)
        invalid_url = reverse('channel-member-role-update', kwargs={
            'conversation_id': self.conversation.id,
            'user_id': self.outside_user.id
        })
        data = {'role_id': str(self.new_custom_role.id)}
        
        response = self.client.patch(invalid_url, data)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_assign_role_from_another_channel(self):
        other_conversation = Conversation.objects.create(type=Conversation.Type.CHANNEL, owner=self.owner)
        foreign_role = Role.objects.create(conversation=other_conversation, name='Foreign Role')
        
        self.client.force_authenticate(user=self.owner)
        data = {'role_id': str(foreign_role.id)}
        
        response = self.client.patch(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_change_owner_role(self):
        self.client.force_authenticate(user=self.admin)
        owner_url = reverse('channel-member-role-update', kwargs={
            'conversation_id': self.conversation.id,
            'user_id': self.owner.id
        })
        data = {'role_id': str(self.basic_role.id)}
        
        response = self.client.patch(owner_url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)