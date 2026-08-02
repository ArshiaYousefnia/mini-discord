from channels.testing import WebsocketCommunicator
from channels.db import database_sync_to_async
from django.test import TransactionTestCase
from django.contrib.auth import get_user_model
from users.consumers import OnlineStatusConsumer

User = get_user_model()

class OnlineStatusConsumerTests(TransactionTestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser', email='test@test.com',
            password='password', display_name='Tester'
        )
        self.other_user = User.objects.create_user(
            username='other', email='other@test.com',
            password='password', display_name='Other'
        )

    async def async_connect(self, user):
        communicator = WebsocketCommunicator(
            OnlineStatusConsumer.as_asgi(), '/ws/online/'
        )
        communicator.scope['user'] = user
        connected, _ = await communicator.connect()
        return communicator, connected

    async def test_anonymous_rejected(self):
        from django.contrib.auth.models import AnonymousUser
        communicator = WebsocketCommunicator(
            OnlineStatusConsumer.as_asgi(), '/ws/online/'
        )
        communicator.scope['user'] = AnonymousUser()
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_authenticated_connect_and_online(self):
        communicator, connected = await self.async_connect(self.user)
        self.assertTrue(connected)

        # Should receive a user_status message for self
        response = await communicator.receive_json_from()
        self.assertEqual(response['type'], 'user_status')
        self.assertEqual(response['user_id'], str(self.user.id))
        self.assertTrue(response['is_online'])

        # Refresh the user asynchronously
        await database_sync_to_async(self.user.refresh_from_db)()
        # Now check is_online (still inside async, but after sync call)
        self.assertTrue(self.user.is_online)

        await communicator.disconnect()

    async def test_disconnect_marks_offline(self):
        communicator, connected = await self.async_connect(self.user)
        self.assertTrue(connected)
        # Discard the initial status message
        await communicator.receive_json_from()

        await communicator.disconnect()

        # Refresh and check offline asynchronously
        await database_sync_to_async(self.user.refresh_from_db)()
        self.assertFalse(self.user.is_online)

    async def test_broadcast_to_other_clients(self):
        # Connect first user
        comm1, _ = await self.async_connect(self.user)
        await comm1.receive_json_from()  # consume initial

        # Connect second user
        comm2, _ = await self.async_connect(self.other_user)

        # comm2's own status
        msg2 = await comm2.receive_json_from()
        self.assertEqual(msg2['user_id'], str(self.other_user.id))
        self.assertTrue(msg2['is_online'])

        # comm1 should receive a broadcast about other_user
        msg1 = await comm1.receive_json_from()
        self.assertEqual(msg1['user_id'], str(self.other_user.id))
        self.assertTrue(msg1['is_online'])

        await comm1.disconnect()
        await comm2.disconnect()