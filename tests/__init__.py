import os
import unittest

class TestEnvironmentVariables(unittest.TestCase):
    def test_environment_variables(self):
        required_vars = [
            'TELEGRAM_BOT_TOKEN',
            'SUPABASE_URL',
            'SUPABASE_PUBLIC_KEY',
            'SUPABASE_SERVICE_ROLE_KEY'
        ]
        for var in required_vars:
            with self.subTest(var=var):
                self.assertIn(var, os.environ, f"{var} is not set in the environment variables.")

if __name__ == '__main__':
    unittest.main()
