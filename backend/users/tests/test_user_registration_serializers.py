from django.test import TestCase
from django.contrib.auth import get_user_model
from persiantools.jdatetime import JalaliDate
from datetime import date

from rest_framework import serializers

from users.fields import JalaliDateField
from users.serializers import UserRegistrationSerializer

User = get_user_model()

class UserRegistrationSerializerTests(TestCase):
    """Test the UserRegistrationSerializer in isolation."""

    def setUp(self):
        # Use a known Jalali date for testing
        self.jalali_date_str = '1378-03-12'
        self.gregorian_date = JalaliDate(1378, 3, 12).to_gregorian()  # 1999-06-02

        # Data with Jalali date (as frontend sends)
        self.valid_data = {
            'username': 'johndoe',
            'email': 'john@example.com',
            'password': 'Secure@123',
            'display_name': 'John Doe',
            'birthday': self.jalali_date_str
        }

        # Gregorian date for fallback tests
        self.gregorian_data = self.valid_data.copy()
        self.gregorian_data['birthday'] = '1990-05-15'  # Gregorian string

    def test_valid_serializer_data_with_jalali(self):
        """Test that valid data with Jalali date passes validation."""
        serializer = UserRegistrationSerializer(data=self.valid_data)
        self.assertTrue(serializer.is_valid())
        # The validated_data should contain Gregorian date
        self.assertEqual(serializer.validated_data['username'], 'johndoe')
        self.assertEqual(serializer.validated_data['email'], 'john@example.com')
        self.assertEqual(serializer.validated_data['birthday'], self.gregorian_date)

    def test_serializer_creates_user_with_jalali(self):
        """Test that serializer creates a user with hashed password and correct Gregorian birthday."""
        serializer = UserRegistrationSerializer(data=self.valid_data)
        self.assertTrue(serializer.is_valid())
        user = serializer.save()

        self.assertEqual(user.username, 'johndoe')
        self.assertEqual(user.email, 'john@example.com')
        self.assertEqual(user.display_name, 'John Doe')
        self.assertEqual(user.birthday, self.gregorian_date)
        self.assertTrue(user.password.startswith('pbkdf2_sha256'))
        self.assertNotEqual(user.password, 'Secure@123')

    def test_serializer_serializes_user_to_jalali(self):
        """Test that serializing a user instance returns Jalali date."""
        user = User.objects.create_user(
            username='johndoe',
            email='john@example.com',
            password='Secure@123',
            display_name='John Doe',
            birthday=self.gregorian_date
        )
        serializer = UserRegistrationSerializer(user)
        self.assertEqual(serializer.data['birthday'], self.jalali_date_str)

    def test_serializer_username_too_short(self):
        """Test that username length validation works."""
        invalid_data = self.valid_data.copy()
        invalid_data['username'] = 'abc'
        serializer = UserRegistrationSerializer(data=invalid_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('username', serializer.errors)
        self.assertEqual(
            serializer.errors['username'][0],
            'Username must be at least 4 characters.'
        )

    def test_serializer_invalid_email(self):
        """Test that email validation works."""
        invalid_data = self.valid_data.copy()
        invalid_data['email'] = 'not-an-email'
        serializer = UserRegistrationSerializer(data=invalid_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('email', serializer.errors)
        self.assertEqual(
            serializer.errors['email'][0],
            'Please enter a valid email address.'
        )

    def test_serializer_duplicate_username(self):
        """Test that duplicate username validation works."""
        # Create a user first
        User.objects.create_user(
            username='johndoe',
            email='other@example.com',
            password='Test@1234',
            display_name='Other'
        )

        serializer = UserRegistrationSerializer(data=self.valid_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('username', serializer.errors)
        self.assertEqual(
            serializer.errors['username'][0],
            'This username is already taken.'
        )

    def test_serializer_duplicate_email(self):
        """Test that duplicate email validation works."""
        User.objects.create_user(
            username='otheruser',
            email='john@example.com',
            password='Test@1234',
            display_name='Other'
        )

        serializer = UserRegistrationSerializer(data=self.valid_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('email', serializer.errors)
        self.assertEqual(
            serializer.errors['email'][0],
            'This email is already registered.'
        )

    def test_serializer_password_validation(self):
        """Test all password validation rules."""
        test_cases = [
            ('weak', 'Password must be at least 8 characters long.'),
            ('secure@123', 'Password must contain at least one uppercase letter.'),
            ('SECURE@123', 'Password must contain at least one lowercase letter.'),
            ('Secure@ABC', 'Password must contain at least one number.'),
            ('Secure123', 'Password must contain at least one special character (e.g., @).'),
            ('Secure@۱۲۳', 'Password must only contain English characters and allowed special symbols.'),
        ]

        for password, expected_error in test_cases:
            invalid_data = self.valid_data.copy()
            invalid_data['password'] = password
            serializer = UserRegistrationSerializer(data=invalid_data)
            self.assertFalse(serializer.is_valid())
            self.assertIn('password', serializer.errors)
            self.assertEqual(serializer.errors['password'][0], expected_error)

    def test_serializer_missing_display_name(self):
        """Test that display_name is required."""
        invalid_data = self.valid_data.copy()
        invalid_data.pop('display_name')
        serializer = UserRegistrationSerializer(data=invalid_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('display_name', serializer.errors)

    def test_serializer_birthday_optional(self):
        """Test that birthday is optional."""
        data = self.valid_data.copy()
        data.pop('birthday')
        serializer = UserRegistrationSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        user = serializer.save()
        self.assertIsNone(user.birthday)

    def test_serializer_invalid_jalali_date(self):
        """Test that invalid Jalali date raises validation error."""
        invalid_data = self.valid_data.copy()
        invalid_data['birthday'] = '1399-13-32'  # invalid month/day
        serializer = UserRegistrationSerializer(data=invalid_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('birthday', serializer.errors)
        # The error message will come from JalaliDateField
        self.assertIn('Invalid Jalali date format.', str(serializer.errors['birthday']))


class JalaliDateFieldTests(TestCase):
    """Unit tests for the JalaliDateField."""

    def setUp(self):
        self.field = JalaliDateField()

    def test_valid_jalali_string_converts_to_gregorian(self):
        """Given a valid Jalali string, to_internal_value returns Gregorian date."""
        result = self.field.to_internal_value('1378-03-12')
        expected = JalaliDate(1378, 3, 12).to_gregorian()  # 1999-06-02
        self.assertEqual(result, expected)

    def test_invalid_jalali_date_raises_error(self):
        """Given a string with valid format but invalid Jalali date, raise ValidationError."""
        with self.assertRaises(serializers.ValidationError) as cm:
            self.field.to_internal_value('1399-13-32')  # month 13, day 32
        self.assertEqual(cm.exception.detail[0], 'Invalid Jalali date format.')

    def test_malformed_date_string_raises_error(self):
        """Given a string not in YYYY-MM-DD format, raise ValidationError."""
        with self.assertRaises(serializers.ValidationError) as cm:
            self.field.to_internal_value('not-a-date')
        self.assertEqual(cm.exception.detail[0], 'Date must be in YYYY-MM-DD format.')

    def test_none_or_empty_returns_none(self):
        """Given None or empty string, to_internal_value returns None."""
        self.assertIsNone(self.field.to_internal_value(None))
        self.assertIsNone(self.field.to_internal_value(''))

    def test_gregorian_to_representation_returns_jalali_string(self):
        """Given a Gregorian date, to_representation returns Jalali string."""
        greg = date(1999, 6, 2)
        result = self.field.to_representation(greg)
        self.assertEqual(result, '1378-03-12')