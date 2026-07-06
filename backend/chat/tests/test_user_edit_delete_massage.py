from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

from chat.models import Conversation, ConversationMember, Message

User = get_user_model()

class MessageEditDeleteTests(APITestCase):
    def setUp(self):
        self.user1 = User.objects.create_user(
            username='user1', email='user1@test.com', password='password123', display_name='User One'
        )
        self.user2 = User.objects.create_user(
            username='user2', email='user2@test.com', password='password123', display_name='User Two'
        )

        self.conversation = Conversation.objects.create(type=Conversation.Type.DM)
        ConversationMember.objects.create(conversation=self.conversation, user=self.user1)
        ConversationMember.objects.create(conversation=self.conversation, user=self.user2)

        self.message = Message.objects.create(
            conversation=self.conversation,
            sender=self.user1,
            content="پیام اصلی و اولیه"
        )

        self.url = f'/api/chat/conversations/{self.conversation.id}/messages/{self.message.id}/'

    def test_edit_message_success(self):
        """تست ویرایش پیام توسط صاحب پیام (باید موفق باشد)"""
        self.client.force_authenticate(user=self.user1)
        data = {'content': 'پیام ویرایش شده'}
        
        response = self.client.patch(self.url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.message.refresh_from_db()
        self.assertEqual(self.message.content, 'پیام ویرایش شده')
        self.assertTrue(self.message.is_edited)

    def test_edit_message_unauthorized(self):
        """تست ویرایش پیام توسط شخص دیگر (باید ارور ۴۰۳ بدهد)"""
        self.client.force_authenticate(user=self.user2)
        data = {'content': 'تلاش برای هک کردن پیام!'}
        
        response = self.client.patch(self.url, data)
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        self.message.refresh_from_db()
        self.assertEqual(self.message.content, 'پیام اصلی و اولیه')
        self.assertFalse(self.message.is_edited)

    def test_delete_message_success(self):
        """تست حذف پیام توسط صاحب پیام (باید موفق باشد و Soft Delete شود)"""
        self.client.force_authenticate(user=self.user1)
        
        response = self.client.delete(self.url)
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        self.message.refresh_from_db()
        self.assertTrue(self.message.is_deleted)
        self.assertEqual(self.message.content, "") 

    def test_delete_message_unauthorized(self):
        """تست حذف پیام توسط شخص دیگر (باید ارور ۴۰۳ بدهد)"""
        self.client.force_authenticate(user=self.user2)
        
        response = self.client.delete(self.url)
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        self.message.refresh_from_db()
        self.assertFalse(self.message.is_deleted)