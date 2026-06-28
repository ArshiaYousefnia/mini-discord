from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status

from users.models import User


class UserSearchTests(APITestCase):

    def setUp(self):
        self.me = User.objects.create_user(
            username="me",
            email="me@test.com",
            password="StrongPass123!",
            display_name="Me"
        )

        self.other = User.objects.create_user(
            username="ali",
            email="ali@test.com",
            password="StrongPass123!",
            display_name="Ali"
        )

        self.url = reverse("user-search")

    def auth(self, user):
        self.client.force_authenticate(user=user)

    def test_search_user_success(self):
        self.auth(self.me)

        res = self.client.get(self.url, {"username": "ali"})

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["username"], "ali")
        self.assertFalse(res.data["is_self"])

    def test_search_case_insensitive(self):
        self.auth(self.me)

        res = self.client.get(self.url, {"username": "ALI"})

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["username"], "ali")

    def test_user_not_found(self):
        self.auth(self.me)

        res = self.client.get(self.url, {"username": "doesnotexist"})

        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(res.data["error"], "User not found")

    def test_missing_username_param(self):
        self.auth(self.me)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["error"], "username query parameter is required")

    def test_self_search(self):
        self.auth(self.me)

        res = self.client.get(self.url, {"username": "me"})

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["is_self"])
        self.assertEqual(res.data["username"], "me")

    def test_auth_required(self):
        res = self.client.get(self.url, {"username": "ali"})

        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)