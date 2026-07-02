from django.test import TestCase
from chat.models import Conversation
from chat.serializers import MessageSerializer


class MessageSerializerTests(TestCase):
    def setUp(self):
        # Create a real conversation to pass foreign key validation
        self.conversation = Conversation.objects.create(type=Conversation.Type.DM)

    def test_valid_message(self):
        data = {
            "conversation": str(self.conversation.id),
            "content": "Hello world",
        }
        serializer = MessageSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_empty_content(self):
        data = {
            "conversation": str(self.conversation.id),
            "content": "",
        }
        serializer = MessageSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("content", serializer.errors)

    def test_whitespace_only_content(self):
        data = {
            "conversation": str(self.conversation.id),
            "content": "   ",
        }
        serializer = MessageSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("content", serializer.errors)

    def test_content_exceeds_max_length(self):
        data = {
            "conversation": str(self.conversation.id),
            "content": "a" * 2001,
        }
        serializer = MessageSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("content", serializer.errors)

    def test_content_exactly_2000_characters(self):
        data = {
            "conversation": str(self.conversation.id),
            "content": "a" * 2000,
        }
        serializer = MessageSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)