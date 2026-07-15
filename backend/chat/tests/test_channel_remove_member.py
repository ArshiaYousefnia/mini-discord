from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from chat.models import Conversation, Channel, ConversationMember, Role

User = get_user_model()

class ChannelRemoveMemberTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='owner', email='owner@example.com', password='pass')
        self.moderator = User.objects.create_user(username='mod', email='mod@example.com', password='pass')
        self.normal_user = User.objects.create_user(username='normal', email='normal@example.com', password='pass')
        self.target_user = User.objects.create_user(username='target', email='target@example.com', password='pass')
        self.outsider = User.objects.create_user(username='outsider', email='outsider@example.com', password='pass')

        # ۲. ساخت کانال
        self.conversation = Conversation.objects.create(
            type=Conversation.Type.CHANNEL,
            name="Kick Test Channel",
            owner=self.owner
        )
        self.channel = Channel.objects.create(conversation=self.conversation, is_private=False)

        self.mod_role = Role.objects.create(
            conversation=self.conversation, name="Moderator", can_manage_members=True
        )
        self.normal_role = Role.objects.create(
            conversation=self.conversation, name="Member", can_manage_members=False
        )

        ConversationMember.objects.create(conversation=self.conversation, user=self.owner)
        ConversationMember.objects.create(conversation=self.conversation, user=self.moderator, role=self.mod_role)
        ConversationMember.objects.create(conversation=self.conversation, user=self.normal_user, role=self.normal_role)
        
        self.target_membership = ConversationMember.objects.create(
            conversation=self.conversation, user=self.target_user, role=self.normal_role
        )

    def get_url(self, user_id):
        return reverse('channel-remove-member', kwargs={
            'conversation_id': self.conversation.id,
            'user_id': user_id
        })

    def test_owner_can_kick_member(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(self.get_url(self.target_user.id))
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        # تایید اینکه کاربر واقعاً از دیتابیس پاک شده است
        self.assertFalse(ConversationMember.objects.filter(user=self.target_user).exists())

    def test_moderator_can_kick_member(self):
        self.client.force_authenticate(user=self.moderator)
        response = self.client.delete(self.get_url(self.target_user.id))
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ConversationMember.objects.filter(user=self.target_user).exists())

    def test_normal_user_cannot_kick_member(self):
        self.client.force_authenticate(user=self.normal_user)
        response = self.client.delete(self.get_url(self.target_user.id))
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(ConversationMember.objects.filter(user=self.target_user).exists())

    def test_cannot_kick_owner(self):
        self.client.force_authenticate(user=self.moderator)
        response = self.client.delete(self.get_url(self.owner.id))
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], "The channel owner cannot be removed.")

    def test_cannot_kick_self(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(self.get_url(self.owner.id))
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], "You cannot kick yourself. Please use the leave option.")

    def test_kick_non_member(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(self.get_url(self.outsider.id))
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data['detail'], "User is not a member of this channel.")