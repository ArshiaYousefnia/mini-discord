from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from chat.models import Message

User = get_user_model()


class DeleteMessageTest(APITestCase):

    def setUp(self):
        self.user1 = User.objects.create_user(
            username="user1",
            email="u1@test.com",
            password="Test123!@#",
            display_name="User 1"
        )

        self.user2 = User.objects.create_user(
            username="user2",
            email="u2@test.com",
            password="Test123!@#",
            display_name="User 2"
        )

        self.message = Message.objects.create(
            sender=self.user1,
            text="Hello world"
        )

        self.url = reverse(
            "delete-message",
            kwargs={"message_id": self.message.id}
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_owner_can_delete_message(self):
        self.authenticate(self.user1)

        response = self.client.delete(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.message.refresh_from_db()
        self.assertTrue(self.message.is_deleted)

    def test_non_owner_cannot_delete_message(self):
        self.authenticate(self.user2)

        response = self.client.delete(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.message.refresh_from_db()
        self.assertFalse(self.message.is_deleted)

    def test_unauthenticated_user_cannot_delete(self):
        response = self.client.delete(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)