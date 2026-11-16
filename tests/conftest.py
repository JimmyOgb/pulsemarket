import pytest
from datetime import datetime, timezone
import sys
import gltest.direct.vm as vm_mod
import gltest.direct.sdk_compat as sc_mod
import gltest.direct.wasi_mock as wasi_mock


def _get_dt(self):
    vm = wasi_mock.get_vm()
    if vm and getattr(vm, "_datetime", None):
        return vm._datetime
    return datetime.now(timezone.utc).isoformat()


def ensure_gl_message_datetime():
    cur_gl = sys.modules.get("genlayer.gl")
    if cur_gl and hasattr(cur_gl, "MessageType"):
        if not hasattr(cur_gl.MessageType, "datetime"):
            setattr(cur_gl.MessageType, "datetime", property(_get_dt))
    if cur_gl and hasattr(cur_gl, "message"):
        msg = cur_gl.message
        if not hasattr(msg, "datetime"):
            try:
                setattr(type(msg), "datetime", property(_get_dt))
            except Exception:
                pass


# Patch at module load time
orig_refresh = vm_mod.VMContext._refresh_gl_message


def patched_refresh(self):
    orig_refresh(self)
    ensure_gl_message_datetime()


vm_mod.VMContext._refresh_gl_message = patched_refresh

orig_sync = sc_mod.sync_message_context


def patched_sync(*args, **kwargs):
    orig_sync(*args, **kwargs)
    ensure_gl_message_datetime()


sc_mod.sync_message_context = patched_sync
vm_mod.sync_message_context = patched_sync


@pytest.fixture(autouse=True)
def setup_datetime_hook():
    ensure_gl_message_datetime()
    yield
    ensure_gl_message_datetime()
