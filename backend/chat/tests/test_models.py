from django.test import TestCase
from django.contrib.auth import get_user_model
from chat.models import Conversation, ConversationMember, Message

User = get_user_model()


class ConversationModelTests(TestCase):
    def test_create_dm_conversation(self):
        conv = Conversation.objects.create(type=Conversation.Type.DM)
        self.assertEqual(conv.type, Conversation.Type.DM)
        self.assertIsNone(conv.name)
        self.assertIsNotNone(conv.id)
        self.assertIsNotNone(conv.created_at)

    def test_create_named_conversation(self):
        conv = Conversation.objects.create(
            type=Conversation.Type.GROUP,
            name="Test Group"
        )
        self.assertEqual(conv.name, "Test Group")


class ConversationMemberModelTests(TestCase):
    def setUp(self):
        self.user1 = User.objects.create_user(username="alice", email="alice@test.com", password="pass")
        self.user2 = User.objects.create_user(username="bob", email="bob@test.com", password="pass")
        self.conv = Conversation.objects.create(type=Conversation.Type.DM)

    def test_create_member(self):
        member = ConversationMember.objects.create(
            conversation=self.conv,
            user=self.user1
        )
        self.assertEqual(member.conversation, self.conv)
        self.assertEqual(member.user, self.user1)
        self.assertIsNotNone(member.joined_at)

    def test_unique_together_constraint(self):
        ConversationMember.objects.create(conversation=self.conv, user=self.user1)
        with self.assertRaises(Exception):  # IntegrityError
            ConversationMember.objects.create(conversation=self.conv, user=self.user1)


class MessageModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", email="alice@test.com", password="pass")
        self.conv = Conversation.objects.create(type=Conversation.Type.DM)
        ConversationMember.objects.create(conversation=self.conv, user=self.user)

    def test_create_message(self):
        msg = Message.objects.create(
            conversation=self.conv,
            sender=self.user,
            content="Hello"
        )
        self.assertEqual(msg.content, "Hello")
        self.assertFalse(msg.is_edited)
        self.assertFalse(msg.is_deleted)
        self.assertIsNotNone(msg.created_at)
        self.assertIsNotNone(msg.updated_at)

    def test_message_ordering(self):
        msg1 = Message.objects.create(conversation=self.conv, sender=self.user, content="First")
        msg2 = Message.objects.create(conversation=self.conv, sender=self.user, content="Second")
        messages = list(Message.objects.all())
        self.assertEqual(messages[0], msg1)
        self.assertEqual(messages[1], msg2)