from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from chat.models import Conversation, Channel, ConversationMember, Role

User = get_user_model()
class ChannelRemoveMemberTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='owner', email='owner@test.com', password='password')
        self.mod = User.objects.create_user(username='moderator', email='mod@test.com', password='password')
        self.normal_user = User.objects.create_user(username='normal_user', email='normal@test.com', password='password')
        self.target_user = User.objects.create_user(username='target_user', email='target@test.com', password='password')
        self.conversation = Conversation.objects.create(
            name="Test Channel", 
            type=Conversation.Type.CHANNEL
        )
        self.owner_role = Role.objects.create(name="Owner", can_remove_members=True)
        self.mod_role = Role.objects.create(name="Moderator", can_remove_members=True)
        self.normal_role = Role.objects.create(name="Member", can_remove_members=False)

        # FIXED: M2M Initialization for all users
        owner_member = ConversationMember.objects.create(conversation=self.conversation, user=self.owner)
        owner_member.roles.add(self.owner_role)

        mod_member = ConversationMember.objects.create(conversation=self.conversation, user=self.mod)
        mod_member.roles.add(self.mod_role)

        normal_member = ConversationMember.objects.create(conversation=self.conversation, user=self.normal_user)
        normal_member.roles.add(self.normal_role)

        self.target_membership = ConversationMember.objects.create(conversation=self.conversation, user=self.target_user)
        self.target_membership.roles.add(self.normal_role)

        self.url = f'/api/channels/{self.conversation.id}/members/{self.target_membership.id}/'

    def test_mod_can_remove_member(self):
        self.client.force_authenticate(user=self.mod)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ConversationMember.objects.filter(id=self.target_membership.id).exists())

    def test_normal_user_cannot_remove_member(self):
        self.client.force_authenticate(user=self.normal_user)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_cannot_kick_themselves(self):
        self.client.force_authenticate(user=self.owner)
        owner_membership = ConversationMember.objects.get(user=self.owner)
        self_kick_url = f'/api/channels/{self.conversation.id}/members/{owner_membership.id}/'
        
        response = self.client.delete(self_kick_url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)