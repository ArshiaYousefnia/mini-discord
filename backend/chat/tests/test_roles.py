from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from chat.models import Conversation, Channel, Role, ConversationMember

User = get_user_model()

class ChannelRoleEditTests(APITestCase):
    def setUp(self):
        # ساخت کاربران
        self.owner = User.objects.create_user(username='owner_user',email='channelOwner@test.com', password='password123')
        self.member = User.objects.create_user(username='normal_member',email='channelmember@test.com', password='password123')

        self.conversation = Conversation.objects.create(
            type=Conversation.Type.CHANNEL,
            name="Backend Devs Channel",
            owner=self.owner
        )
        self.channel = Channel.objects.create(
            conversation=self.conversation,
            is_private=True
        )

        self.owner_role = Role.objects.create(
            conversation=self.conversation,
            name='Channel Owner',
            can_send_messages=True,
            can_manage_roles=True
        )
        self.owner_membership = ConversationMember.objects.create(
            conversation=self.conversation, user=self.owner
        )
        self.owner_membership.roles.add(self.owner_role)

        # ساخت یک Custom Role برای ویرایش شدن
        self.custom_role = Role.objects.create(
            conversation=self.conversation,
            name='Junior Moderator',
            can_send_messages=True,
            can_delete_messages=False,
            can_manage_roles=False
        )
        
        self.member_membership = ConversationMember.objects.create(
            conversation=self.conversation, user=self.member
        )
        self.member_membership.roles.add(self.custom_role)

        self.role_edit_url = reverse('channel-role-detail', kwargs={
            'conversation_id': self.conversation.id,
            'role_id': self.custom_role.id
        })
        self.owner_role_edit_url = reverse('channel-role-detail', kwargs={
            'conversation_id': self.conversation.id,
            'role_id': self.owner_role.id
        })

    def test_owner_can_edit_custom_role_name_and_permissions(self):
        self.client.force_authenticate(user=self.owner)
        data = {
            'name': 'Senior Moderator',
            'can_delete_messages': True,  
            'can_send_media': False      
        }
        
        response = self.client.patch(self.role_edit_url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.custom_role.refresh_from_db()
        self.assertEqual(self.custom_role.name, 'Senior Moderator')
        self.assertTrue(self.custom_role.can_delete_messages)
        self.assertFalse(self.custom_role.can_send_media)

    def test_owner_cannot_edit_channel_owner_role(self):
        self.client.force_authenticate(user=self.owner)
        data = {
            'name': 'Downgraded Owner', 
            'can_send_messages': False
        }
        
        response = self.client.patch(self.owner_role_edit_url, data)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Cannot edit the Channel Owner role.')

    def test_non_owner_cannot_edit_roles(self):
        self.client.force_authenticate(user=self.member)
        data = {
            'can_delete_messages': True
        }
        
        response = self.client.patch(self.role_edit_url, data)
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['detail'], 'Only the channel owner can manage roles.')
        
    def test_unauthenticated_users_cannot_access(self):
        data = {'name': 'Hacker Role'}
        response = self.client.patch(self.role_edit_url, data)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)