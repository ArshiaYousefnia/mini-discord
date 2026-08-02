from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from chat.models import Conversation, Channel, ConversationMember, Role, Topic 

User = get_user_model()

class ManageOthersTopicsTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='owner',email='channelOwner@test.com', password='testpassword')
        self.creator = User.objects.create_user(username='creator',email='channelcreator@test.com', password='testpassword')
        self.moderator = User.objects.create_user(username='moderator',email='channelmoderator@test.com', password='testpassword')
        self.regular_member = User.objects.create_user(username='member',email='channelmember@test.com', password='testpassword')

        self.conversation = Conversation.objects.create(
            type=Conversation.Type.CHANNEL,
            name='Test Channel',
            owner=self.owner
        )
        self.channel = Channel.objects.create(conversation=self.conversation)

        ConversationMember.objects.create(conversation=self.conversation, user=self.owner)
        self.creator_membership = ConversationMember.objects.create(conversation=self.conversation, user=self.creator)
        self.mod_membership = ConversationMember.objects.create(conversation=self.conversation, user=self.moderator)
        self.reg_membership = ConversationMember.objects.create(conversation=self.conversation, user=self.regular_member)

        self.topic = Topic.objects.create(
            conversation=self.conversation,
            name='Original Topic Name',
            creator=self.creator
        )

        self.mod_role = Role.objects.create(
            conversation=self.conversation,
            name='Moderator Role',
            can_manage_others_topics=True
        )
        self.mod_membership.roles.add(self.mod_role)

        self.url = reverse('topic-detail', kwargs={
            'conversation_id': self.conversation.id,
            'topic_id': self.topic.id
        })

    def test_creator_can_edit_and_delete_own_topic(self):
        self.client.force_authenticate(user=self.creator)
        
        patch_res = self.client.patch(self.url, {'name': 'Creator Edited Name'})
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        
        del_res = self.client.delete(self.url)
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Topic.objects.filter(id=self.topic.id).exists())

    def test_owner_can_edit_and_delete_others_topics(self):
        self.client.force_authenticate(user=self.owner)
        
        patch_res = self.client.patch(self.url, {'name': 'Owner Edited Name'})
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        
        del_res = self.client.delete(self.url)
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)

    def test_member_with_permission_can_manage_others_topics(self):
        self.client.force_authenticate(user=self.moderator)
        
        patch_res = self.client.patch(self.url, {'name': 'Moderator Edited Name'})
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.topic.refresh_from_db()
        self.assertEqual(self.topic.name, 'Moderator Edited Name')
        
        del_res = self.client.delete(self.url)
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Topic.objects.filter(id=self.topic.id).exists())

    def test_regular_member_cannot_manage_others_topics(self):
        self.client.force_authenticate(user=self.regular_member)
        
        patch_res = self.client.patch(self.url, {'name': 'Hacked Name'})
        self.assertEqual(patch_res.status_code, status.HTTP_403_FORBIDDEN)
        
        del_res = self.client.delete(self.url)
        self.assertEqual(del_res.status_code, status.HTTP_403_FORBIDDEN)
        
        self.topic.refresh_from_db()
        self.assertEqual(self.topic.name, 'Original Topic Name')
        self.assertTrue(Topic.objects.filter(id=self.topic.id).exists())