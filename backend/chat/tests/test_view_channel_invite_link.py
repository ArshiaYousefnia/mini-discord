from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from chat.models import Conversation, Channel, ConversationMember, Role

User = get_user_model()

class ChannelInviteLinkVisibilityTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username='owner_user', email='owner@example.com', password='pass123'
        )
        self.admin_user = User.objects.create_user(
            username='admin_user', email='admin@example.com', password='pass123'
        )
        self.normal_user = User.objects.create_user(
            username='normal_user', email='normal@example.com', password='pass123'
        )

        # ساخت کانال
        self.conversation = Conversation.objects.create(
            type=Conversation.Type.CHANNEL,
            name="Test Channel",
            owner=self.owner
        )
        self.channel = Channel.objects.create(
            conversation=self.conversation,
            is_private=True
        )

        # نقش‌ها
        self.admin_role = Role.objects.create(
            conversation=self.conversation,
            name="Admin",
            can_manage_members=True 
        )
        self.normal_role = Role.objects.create(
            conversation=self.conversation,
            name="Member",
            can_manage_members=False 
        )

        ConversationMember.objects.create(conversation=self.conversation, user=self.owner) 
        
        # ۲. کاربر ادمین
        admin_member = ConversationMember.objects.create(conversation=self.conversation, user=self.admin_user)
        admin_member.roles.add(self.admin_role)
        
        # ۳. کاربر عادی
        normal_member = ConversationMember.objects.create(conversation=self.conversation, user=self.normal_user)
        normal_member.roles.add(self.normal_role)
        # ---------------------
        self.profile_url = reverse('channel-profile', kwargs={'conversation_id': self.conversation.id})

    def test_owner_can_see_invite_link(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(self.profile_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data.get('invite_link'))
        self.assertIn(str(self.channel.invite_code), response.data['invite_link'])

    def test_admin_can_see_invite_link(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(self.profile_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data.get('invite_link'))

    def test_normal_user_cannot_see_invite_link(self):
        self.client.force_authenticate(user=self.normal_user)
        response = self.client.get(self.profile_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data.get('invite_link'))