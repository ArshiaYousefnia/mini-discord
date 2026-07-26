from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from chat.models import Conversation, Channel, ConversationMember, Role 

User = get_user_model()

class ChannelMemberRoleRemoveTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='owner',email='channelOwner@test.com', password='password123')
        self.admin = User.objects.create_user(username='admin',email='channelAdmin@test.com', password='password123')
        self.member = User.objects.create_user(username='member',email='channelMember@test.com', password='password123')
        self.stranger = User.objects.create_user(username='stranger',email='channelStranger@test.com', password='password123')

        self.conversation = Conversation.objects.create(
            type=Conversation.Type.CHANNEL,
            name='Test Channel',
            owner=self.owner
        )
        self.channel = Channel.objects.create(conversation=self.conversation)

        self.owner_membership = ConversationMember.objects.create(conversation=self.conversation, user=self.owner)
        self.admin_membership = ConversationMember.objects.create(conversation=self.conversation, user=self.admin)
        self.member_membership = ConversationMember.objects.create(conversation=self.conversation, user=self.member)

        self.admin_role = Role.objects.create(
            conversation=self.conversation,
            name='Admin',
            can_manage_roles=True
        )
        self.custom_role = Role.objects.create(
            conversation=self.conversation,
            name='Moderator',
            can_delete_messages=True
        )

        self.admin_membership.roles.add(self.admin_role)
        self.member_membership.roles.add(self.custom_role)

        self.url = reverse('channel-member-role-remove', kwargs={
            'conversation_id': self.conversation.id,
            'user_id': self.member.id,
            'role_id': self.custom_role.id
        })

    def test_owner_can_remove_role(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(self.url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(self.member_membership.roles.filter(id=self.custom_role.id).exists())

    def test_admin_with_permission_can_remove_role(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(self.url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(self.member_membership.roles.filter(id=self.custom_role.id).exists())

    def test_regular_member_cannot_remove_role(self):
        self.client.force_authenticate(user=self.member)
        response = self.client.delete(self.url)
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(self.member_membership.roles.filter(id=self.custom_role.id).exists())

    def test_cannot_remove_role_from_owner(self):
        self.owner_membership.roles.add(self.custom_role)
        
        url = reverse('channel-member-role-remove', kwargs={
            'conversation_id': self.conversation.id,
            'user_id': self.owner.id,
            'role_id': self.custom_role.id
        })
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], "You cannot change the role of the channel owner.")

    def test_remove_nonexistent_role(self):
        import uuid
        fake_role_id = uuid.uuid4()
        
        url = reverse('channel-member-role-remove', kwargs={
            'conversation_id': self.conversation.id,
            'user_id': self.member.id,
            'role_id': fake_role_id
        })
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_remove_role_from_non_member(self):
        url = reverse('channel-member-role-remove', kwargs={
            'conversation_id': self.conversation.id,
            'user_id': self.stranger.id,
            'role_id': self.custom_role.id
        })
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)