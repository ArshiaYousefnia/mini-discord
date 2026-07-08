from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.core.files.uploadedfile import SimpleUploadedFile
from users.models import User
import io


class UserProfileUpdateTests(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="StrongPass123!",
            display_name="Test User"
        )

        self.client.force_authenticate(user=self.user)

        self.url = reverse(
            "user-profile-update",
            kwargs={"user_id": self.user.id}
        )

    def test_update_display_name(self):
        res = self.client.patch(self.url, {
            "display_name": "New Name"
        })

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.display_name, "New Name")

    def test_display_name_max_length(self):
        res = self.client.patch(self.url, {
            "display_name": "x" * 33
        })

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_update_email_unique(self):
        User.objects.create_user(
            username="other",
            email="other@example.com",
            password="StrongPass123!",
            display_name="Other"
        )

        res = self.client.patch(self.url, {
            "email": "other@example.com"
        })

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_update_bio_limit(self):
        res = self.client.patch(self.url, {
            "bio": "x" * 200
        })

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_avatar_upload_valid(self):
        image = SimpleUploadedFile(
            "avatar.png",
            b"file_content",
            content_type="image/png"
        )

        res = self.client.patch(self.url, {
            "avatar": image
        }, format="multipart")

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_avatar_size_limit(self):
        big_file = SimpleUploadedFile(
            "big.png",
            b"x" * (3 * 1024 * 1024),  
            content_type="image/png"
        )

        res = self.client.patch(self.url, {
            "avatar": big_file
        }, format="multipart")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_username_cannot_be_updated(self):
        res = self.client.patch(self.url, {
            "username": "hacked"
        })

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, "testuser")