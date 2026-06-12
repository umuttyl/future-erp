"""ConnectionManager platform-admin soket ayrımı.

ADM-10 sonrası: WS handler artık imzalı JWT `is_platform_admin` claim'ine güvenir;
PlatformUser tablosu DB-lookup'ı kaldırıldı (gereksiz çift kontrol). ConnectionManager
davranışı (admin soketini ayrı tutma) burada doğrulanır.
"""
from __future__ import annotations

from app.realtime.notification_ws_hub import ConnectionManager


class TestConnectionManagerPlatformAdmin:
    def test_non_platform_admin_not_in_admin_sockets(self):
        """is_platform_admin=False must NOT add socket to _admin_sockets."""
        import asyncio

        class FakeWS:
            async def accept(self): pass
            async def send_json(self, _): pass

        ws = FakeWS()
        mgr = ConnectionManager()

        async def _run():
            await mgr.connect(ws, tenant_id=1, is_platform_admin=False)

        asyncio.run(_run())
        assert ws not in mgr._admin_sockets
        assert mgr.admin_connected is False

    def test_platform_admin_added_to_admin_sockets(self):
        import asyncio

        class FakeWS:
            async def accept(self): pass

        ws = FakeWS()
        mgr = ConnectionManager()

        async def _run():
            await mgr.connect(ws, tenant_id=1, is_platform_admin=True)

        asyncio.run(_run())
        assert ws in mgr._admin_sockets
        assert mgr.admin_connected is True
