from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model

User = get_user_model()

class LogoutAPITests(APITestCase):
    def setUp(self):
        self.logout_url = reverse('logout') 
        
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='StrongPassword123!',
            display_name='Test User'
        )
        
        self.token = RefreshToken.for_user(self.user)

    def test_logout_success(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token.access_token}')
        
        response = self.client.post(self.logout_url, {
            'refresh': str(self.token)
        })
        
        self.assertEqual(response.status_code, status.HTTP_205_RESET_CONTENT)

    def test_logout_invalid_token(self):
        response = self.client.post(self.logout_url, {
            'refresh': 'fake-invalid-token'
        })
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_logout_missing_token(self):
        response = self.client.post(self.logout_url, {})
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)