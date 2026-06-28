from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from chat.models import Message

User = get_user_model()


class EditMessageTest(APITestCase):

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
            "edit-message",
            kwargs={"message_id": self.message.id}
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_owner_can_edit_message(self):
        self.authenticate(self.user1)

        response = self.client.patch(self.url, {
            "text": "Edited message"
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.message.refresh_from_db()
        self.assertEqual(self.message.text, "Edited message")
        self.assertTrue(self.message.is_edited)

    def test_non_owner_cannot_edit_message(self):
        self.authenticate(self.user2)

        response = self.client.patch(self.url, {
            "text": "Hacked edit"
        })

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.message.refresh_from_db()
        self.assertEqual(self.message.text, "Hello world")

    def test_empty_message_rejected(self):
        self.authenticate(self.user1)

        response = self.client.patch(self.url, {
            "text": "   "
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_user_cannot_edit(self):
        response = self.client.patch(self.url, {
            "text": "New text"
        })

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_updated_at_changes_on_edit(self):
        self.authenticate(self.user1)

        old_time = self.message.updated_at

        self.client.patch(self.url, {
            "text": "New version"
        })

        self.message.refresh_from_db()

        self.assertGreater(self.message.updated_at, old_time)