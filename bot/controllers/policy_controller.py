from bot.services.policy_service import PolicyService

class PolicyController:
    def __init__(self):
        self.policy_service = PolicyService()

    async def setup_policies(self):
        return await self.policy_service.verify_and_setup_policies()