from rest_framework import serializers
from django.core.validators import EmailValidator, MinLengthValidator
from django.core.exceptions import ValidationError

from .fields import JalaliDateField
from .models import User
import re

class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )

    email = serializers.EmailField(
        required=True,
        error_messages={
            'invalid': 'Please enter a valid email address.',
            'unique': 'This email is already registered.'
        }
    )

    birthday = JalaliDateField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = ('username', 'email', 'birthday', 'display_name', 'password')
        extra_kwargs = {
            'username': {
                'validators': [
                    MinLengthValidator(limit_value=4, message='Username must be at least 4 characters.')
                ],
                'error_messages': {
                    'unique': 'This username is already taken.',
                }
            }
        }

    def validate_email(self, value):
        """Validate email format and uniqueness with custom messages."""
        # Validate format using EmailValidator with custom message
        try:
            EmailValidator(message='Please enter a valid email address.')(value)
        except ValidationError as e:
            raise serializers.ValidationError('Please enter a valid email address.')

        # Check uniqueness
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('This email is already registered.')

        return value

    def validate_username(self, value):
        """Validate username."""
        if len(value) < 4:
            raise serializers.ValidationError('Username must be at least 4 characters.')
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError('This username is already taken.')
        return value

    def validate_password(self, value):
        """Validate password complexity."""
        if len(value) < 8:
            raise serializers.ValidationError("Password must be at least 8 characters long.")
        if not re.search(r'[A-Z]', value):
            raise serializers.ValidationError("Password must contain at least one uppercase letter.")
        if not re.search(r'[a-z]', value):
            raise serializers.ValidationError("Password must contain at least one lowercase letter.")
        if not re.search(r'\d', value):
            raise serializers.ValidationError("Password must contain at least one number.")
        if not re.search(r'[!@#$%^&*()_+{}\[\]:;<>?~]', value):
            raise serializers.ValidationError("Password must contain at least one special character (e.g., @).")
        if not re.match(r'^[A-Za-z0-9!@#$%^&*()_+{}\[\]:;<>?~]+$', value):
            raise serializers.ValidationError("Password must only contain English characters and allowed special symbols.")
        return value

    def create(self, validated_data):
        """Create the user with hashed password."""
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            birthday=validated_data.get('birthday'),
            display_name=validated_data['display_name']
        )
        return user
    



class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(
        write_only=True,
        required=True,
        style={"input_type": "password"}
    )


class UserProfileSerializer(serializers.ModelSerializer):
    avatar_url = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = (
            'id',
            'username',
            'display_name',
            'bio',
            'avatar_url',
            'is_online',
        )

        read_only_fields = fields




class UserProfileUpdateSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(required=False)
    display_name = serializers.CharField(required=False, max_length=32)
    bio = serializers.CharField(required=False, allow_blank=True, max_length=190)
    avatar = serializers.FileField(required=False)

    class Meta:
        model = User
        fields = ("email", "display_name", "bio", "avatar")

    def validate_email(self, value):
        EmailValidator()(value)

        user = self.instance
        if User.objects.exclude(id=user.id).filter(email=value).exists():
            raise serializers.ValidationError("This email is already registered.")
        return value

    def validate_display_name(self, value):
        if len(value) > 32:
            raise serializers.ValidationError("Display name must be at most 32 characters.")
        return value

    def validate_bio(self, value):
        if len(value) > 190:
            raise serializers.ValidationError("Bio must be at most 190 characters.")
        return value

    def validate_avatar(self, value):
        if value:
            if value.size > 2 * 1024 * 1024:
                raise serializers.ValidationError("Avatar must be smaller than 2MB.")

            if not value.content_type in ["image/jpeg", "image/png"]:
                raise serializers.ValidationError("Only JPG and PNG images are allowed.")

        return value

    def update(self, instance, validated_data):
        validated_data.pop("username", None)

        return super().update(instance, validated_data)
    

class UserSearchSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "display_name",
            "bio",
            "avatar_url",
            "is_online",
        )