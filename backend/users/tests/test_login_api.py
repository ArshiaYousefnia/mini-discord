from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

User = get_user_model()

class LoginAPITests(APITestCase):
    def setUp(self):
        self.login_url = reverse('login')
        
        self.user_data = {
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'StrongPassword123!',
            'display_name': 'Test User'
        }
        
        self.user = User.objects.create_user(**self.user_data)

    def test_login_success(self):
        response = self.client.post(self.login_url, {
            'username': self.user_data['username'],
            'password': self.user_data['password']
        })
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertEqual(response.data['username'], self.user_data['username'])
        self.assertEqual(response.data['email'], self.user_data['email'])

    def test_login_invalid_password(self):
        response = self.client.post(self.login_url, {
            'username': self.user_data['username'],
            'password': 'WrongPassword123!'
        })
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('error', response.data)

    def test_login_invalid_username(self):
        response = self.client.post(self.login_url, {
            'username': 'nonexistentuser',
            'password': self.user_data['password']
        })
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('error', response.data)

    def test_login_missing_fields(self):
        response = self.client.post(self.login_url, {})
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)
        self.assertIn('password', response.data)