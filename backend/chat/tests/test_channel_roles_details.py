from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from users.models import User
from chat.models import Conversation, Channel, ConversationMember, Role

class ChannelRoleDetailTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username='owner', email='o@t.com', password='pass', display_name='Owner'
        )
        self.member = User.objects.create_user(
            username='member', email='m@t.com', password='pass', display_name='Member'
        )
        self.channel_conv = Conversation.objects.create(
            type=Conversation.Type.CHANNEL, name='Test', owner=self.owner
        )
        self.channel = Channel.objects.create(conversation=self.channel_conv, is_private=True)
        ConversationMember.objects.create(conversation=self.channel_conv, user=self.owner)

        # Create the default owner role (must exist for delete test)
        self.owner_role = Role.objects.create(
            conversation=self.channel_conv,
            name='Channel Owner',
            can_manage_members=True,
            can_manage_roles=True,
        )

        # Create a custom role for update tests
        self.role = Role.objects.create(conversation=self.channel_conv, name='Mod')

        self.url = reverse('channel-role-detail', kwargs={
            'conversation_id': self.channel_conv.id,
            'role_id': self.role.id
        })

    def test_owner_can_update_role_permissions(self):
        self.client.force_authenticate(user=self.owner)
        data = {'can_delete_messages': True, 'can_create_topic': True}
        response = self.client.patch(self.url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.role.refresh_from_db()
        self.assertTrue(self.role.can_delete_messages)
        self.assertTrue(self.role.can_create_topic)

    def test_non_owner_cannot_update_role(self):
        self.client.force_authenticate(user=self.member)
        response = self.client.patch(self.url, {'can_delete_messages': True}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_role(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Role.objects.filter(id=self.role.id).exists())

    def test_cannot_delete_owner_role(self):
        owner_role = Role.objects.get(conversation=self.channel_conv, name='Channel Owner')
        url = reverse('channel-role-detail', kwargs={
            'conversation_id': self.channel_conv.id,
            'role_id': owner_role.id
        })
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Role.objects.filter(id=owner_role.id).exists())