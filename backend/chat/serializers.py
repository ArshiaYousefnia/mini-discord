from rest_framework import serializers
from .models import Message


class MessageEditSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ("text",)

    def validate_text(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError("Message cannot be empty.")

        if len(value) > 2000:
            raise serializers.ValidationError("Message is too long.")

        return value