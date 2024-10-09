from bot.database.policy_manager import verify_and_setup_policies

class PolicyService:
    async def verify_and_setup_policies(self):
        return await verify_and_setup_policies()