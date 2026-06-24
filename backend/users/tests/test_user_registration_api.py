from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from persiantools.jdatetime import JalaliDate

User = get_user_model()


class UserRegistrationTests(APITestCase):
    def setUp(self):
        self.register_url = reverse('register')
        # Use a known Jalali date
        self.jalali_date_str = '1378-03-12'  # Jalali 1378-03-12
        # Convert to Gregorian for database comparison
        self.gregorian_date = JalaliDate(1378, 3, 12).to_gregorian()  # 1999-06-02

        self.valid_data = {
            'username': 'johndoe',
            'email': 'john@example.com',
            'password': 'Secure@123',
            'display_name': 'John Doe',
            'birthday': self.jalali_date_str
        }

    def test_successful_registration(self):
        """Test that a user can register with valid data."""
        response = self.client.post(self.register_url, self.valid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['message'], 'User registered successfully.')
        self.assertEqual(response.data['username'], 'johndoe')
        self.assertEqual(response.data['email'], 'john@example.com')
        # Response should contain Jalali date
        self.assertEqual(response.data['birthday'], self.jalali_date_str)

        # Check that the user was actually created in the DB
        user = User.objects.get(username='johndoe')
        self.assertEqual(user.email, 'john@example.com')
        self.assertEqual(user.display_name, 'John Doe')
        # Birthday stored as Gregorian
        self.assertEqual(user.birthday, self.gregorian_date)
        # Password should be hashed (not plain text)
        self.assertNotEqual(user.password, 'Secure@123')
        self.assertTrue(user.password.startswith('pbkdf2_sha256'))

    def test_duplicate_username(self):
        """Test that registration fails with a duplicate username."""
        User.objects.create_user(
            username='johndoe',
            email='other@example.com',
            password='Test@1234',
            display_name='Other'
        )
        response = self.client.post(self.register_url, self.valid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)
        self.assertEqual(response.data['username'][0], 'This username is already taken.')

    def test_duplicate_email(self):
        """Test that registration fails with a duplicate email."""
        User.objects.create_user(
            username='otheruser',
            email='john@example.com',
            password='Test@1234',
            display_name='Other'
        )
        response = self.client.post(self.register_url, self.valid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)
        self.assertEqual(response.data['email'][0], 'This email is already registered.')

    def test_invalid_email_format(self):
        """Test that invalid email format returns an error."""
        invalid_data = self.valid_data.copy()
        invalid_data['email'] = 'not-an-email'
        response = self.client.post(self.register_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)
        self.assertEqual(response.data['email'][0], 'Please enter a valid email address.')

    def test_username_too_short(self):
        """Test that username shorter than 4 characters is rejected."""
        invalid_data = self.valid_data.copy()
        invalid_data['username'] = 'abc'  # length 3
        response = self.client.post(self.register_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)
        self.assertEqual(response.data['username'][0], 'Username must be at least 4 characters.')

    def test_password_too_short(self):
        """Test that password shorter than 8 characters is rejected."""
        invalid_data = self.valid_data.copy()
        invalid_data['password'] = 'Abc@12'  # length 6
        response = self.client.post(self.register_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)
        self.assertEqual(response.data['password'][0], 'Password must be at least 8 characters long.')

    def test_password_no_uppercase(self):
        invalid_data = self.valid_data.copy()
        invalid_data['password'] = 'secure@123'  # all lowercase
        response = self.client.post(self.register_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)
        self.assertEqual(response.data['password'][0], 'Password must contain at least one uppercase letter.')

    def test_password_no_lowercase(self):
        invalid_data = self.valid_data.copy()
        invalid_data['password'] = 'SECURE@123'
        response = self.client.post(self.register_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)
        self.assertEqual(response.data['password'][0], 'Password must contain at least one lowercase letter.')

    def test_password_no_digit(self):
        invalid_data = self.valid_data.copy()
        invalid_data['password'] = 'Secure@ABC'  # no digit
        response = self.client.post(self.register_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)
        self.assertEqual(response.data['password'][0], 'Password must contain at least one number.')

    def test_password_no_special_char(self):
        invalid_data = self.valid_data.copy()
        invalid_data['password'] = 'Secure123'  # no special
        response = self.client.post(self.register_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)
        self.assertEqual(response.data['password'][0],
                         'Password must contain at least one special character (e.g., @).')

    def test_password_non_english_characters(self):
        """Test that password with non-English characters (e.g., Persian, Arabic) is rejected."""
        invalid_data = self.valid_data.copy()
        invalid_data['password'] = 'Secure@۱۲۳'  # contains Persian digits
        response = self.client.post(self.register_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)
        self.assertEqual(response.data['password'][0],
                         'Password must only contain English characters and allowed special symbols.')

    def test_birthday_optional(self):
        """Test that birthday can be omitted (null)."""
        data = self.valid_data.copy()
        data.pop('birthday')
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username='johndoe')
        self.assertIsNone(user.birthday)

    def test_display_name_required(self):
        """Test that display_name is required (missing) -> error."""
        data = self.valid_data.copy()
        data.pop('display_name')
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('display_name', response.data)

    def test_confirm_password_not_sent(self):
        """Confirm password is not expected by the backend; even if sent, it's ignored."""
        data = self.valid_data.copy()
        data['confirm_password'] = 'Secure@123'  # not in serializer
        response = self.client.post(self.register_url, data, format='json')
        # Should still succeed because confirm_password is simply ignored
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username='johndoe')
        self.assertEqual(user.display_name, 'John Doe')

    def test_registration_returns_only_safe_fields(self):
        """Ensure the response does not include the password."""
        response = self.client.post(self.register_url, self.valid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn('password', response.data)
        self.assertIn('username', response.data)
        self.assertIn('email', response.data)
        self.assertIn('message', response.data)
        self.assertIn('birthday', response.data)  # birthday is included