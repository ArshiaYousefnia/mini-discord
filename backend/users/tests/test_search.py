from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


class UserSearchTests(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="Ali",
            email="ali@test.com",
            password="Password123!",
            display_name="Ali"
        )

        self.user2 = User.objects.create_user(
            username="Mohammad",
            email="m@test.com",
            password="Password123!",
            display_name="Mohammad"
        )

        self.client.force_authenticate(self.user)

    def test_search_existing_user(self):
        response = self.client.get(
            "/api/users/search/?username=Mohammad"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "Mohammad")

    def test_search_case_insensitive(self):
        response = self.client.get(
            "/api/users/search/?username=mOhAmMaD"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "Mohammad")

    def test_user_not_found(self):
        response = self.client.get(
            "/api/users/search/?username=unknown"
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            response.data["detail"],
            "User not found."
        )

    def test_search_myself(self):
        response = self.client.get(
            "/api/users/search/?username=Ali"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "Ali")