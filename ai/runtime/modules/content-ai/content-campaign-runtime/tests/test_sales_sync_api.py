import unittest

from app.api.v1 import poster as poster_api


class SalesSyncApiTests(unittest.TestCase):
    def test_poster_router_exposes_sales_sync_endpoint(self):
        paths = {route.path for route in poster_api.router.routes}

        self.assertIn("/poster/sales-sync", paths)


if __name__ == "__main__":
    unittest.main()
