import inspect

from app.api.v1 import gallery


def _query_default(func, name):
    return inspect.signature(func).parameters[name].default.default


def test_gallery_collection_endpoints_default_to_current_user_scope():
    assert _query_default(gallery.get_gallery_list, "only_mine") is True
    assert _query_default(gallery.search_gallery, "only_mine") is True
    assert _query_default(gallery.get_gallery_filters, "only_mine") is True
